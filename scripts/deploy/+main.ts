// Deploy script that copies server files and stacks, then spins up docker compose
// Usage: deno run -A scripts/deploy/+main.ts <target>
// Example: deno run -A scripts/deploy/+main.ts offsite

import { error, log, runCommand, success } from "../+lib.ts"
import { load } from "@std/dotenv"

// Parse command line arguments
const args = Deno.args
if (args.length < 1) {
  error("Usage: deno run -A scripts/deploy/+main.ts <target>")
  error("Example: deno run -A scripts/deploy/+main.ts offsite")
  Deno.exit(1)
}

const target = args[0]

const targetPath = `./servers/${target}`

// Load target's .env file to get SSH_ADDRESS and PATH_APPS
const targetEnvPath = `${targetPath}/.env`
const targetEnv = await load({ envPath: targetEnvPath })

const SSH_ADDRESS = targetEnv["SSH_ADDRESS"]
const PATH_APPS = targetEnv["PATH_APPS"]

if (!SSH_ADDRESS || !PATH_APPS) {
  error(`SSH_ADDRESS and PATH_APPS must be set in ${targetEnvPath}`)
  Deno.exit(1)
}

// Load target's config.json to get required stacks
const configPath = `${targetPath}/config.json`
let config: { sharedStacks?: string[] } = {}
try {
  const configContent = await Deno.readTextFile(configPath)
  config = JSON.parse(configContent)
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    log(`${configPath} not found, proceeding without stacks`)
  } else {
    throw err
  }
}

const sharedStacks = config.sharedStacks || []
const localStacks: string[] = []
const localStacksDirExists = await Deno.stat(`${targetPath}/localStacks`).then(() => true).catch(
  () => false
)
if (!localStacksDirExists) {
  log(`${targetPath}/localStacks not found, skipping local stacks`)
} else {
  for await (const entry of Deno.readDir(`${targetPath}/localStacks`)) {
    if (entry.isDirectory) {
      localStacks.push(entry.name)
    }
  }
}

// Create temporary directory for deployment files
const tempDir = await Deno.makeTempDir({ prefix: "deploy_" })
log(`Created temp dir: ${tempDir}`)

try {
  // Copy server folder contents to temp directory
  const whitelist = [".env", "compose.yml", "configs/", "localStacks/"]
  log("Copying files to temp dir...")
  for (const item of whitelist) {
    const srcPath = `${targetPath}/${item}`
    const destPath = `${tempDir}/${item}`

    try {
      const stat = await Deno.stat(srcPath)
      log(` + ${item}`)
      if (stat.isDirectory) {
        await copyDirectory(srcPath, destPath)
      } else if (stat.isFile) {
        await Deno.copyFile(srcPath, destPath)
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        log(` - ${item} not found, skipping...`)
        continue
      }
      throw err
    }
  }

  await Deno.copyFile("./.env.root", `${tempDir}/.env.root`)
  log(` + /.env.root`)

  await copyDirectory("./scripts", `${tempDir}/scripts`)
  log(` + /scripts/`)

  await Deno.copyFile("./deno.jsonc", `${tempDir}/deno.jsonc`)
  log(` + /deno.jsonc`)

  // handle "before.deploy.ts" scripts for local stacks
  for (const stack of localStacks) {
    const beforeDeployPath = `${tempDir}/localStacks/${stack}/before.deploy.ts`
    const doesBeforeDeployExist = await Deno.stat(beforeDeployPath).then(() => true).catch(() =>
      false
    )
    if (doesBeforeDeployExist) {
      log(`Running before.deploy.ts for ${stack}...`)
      const proc = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-R",
          "-W",
          "-E",
          "--env-file=.env.root",
          "--env-file=.env",
          beforeDeployPath,
        ],
        cwd: tempDir,
      })
      const output = await proc.output()
      if (output.code !== 0) {
        error(`before.deploy.ts failed for stack: ${stack}`)
        error(new TextDecoder().decode(output.stderr))
        Deno.exit(1)
      }
      success(`✓ before.deploy.ts for ${stack}`)
    }
  }

  // Copy required shared stacks to temp directory in 'shared' subdirectory
  if (sharedStacks.length > 0) {
    await Deno.mkdir(`${tempDir}/sharedStacks`, { recursive: true })
    for (const stack of sharedStacks) {
      const stackPath = `./sharedStacks/${stack}`
      const destPath = `${tempDir}/sharedStacks/${stack}`

      try {
        await copyDirectory(stackPath, destPath)
        log(` + /sharedStacks/${stack}`)
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          error(`Stack not found: ${stackPath}`)
          Deno.exit(1)
        }
        throw err
      }
    }
  }

  // Rsync temp directory to remote server
  log(`Syncing files to ${SSH_ADDRESS}:${PATH_APPS}...`)
  const rsyncArgs = [
    "-avhzru",
    // Don't use --delete to avoid permission issues with running containers
    // "--delete",
    "-e",
    "ssh",
    `${tempDir}/`,
    `${SSH_ADDRESS}:${PATH_APPS}/`,
  ]

  const rsyncCommand = await runCommand(["rsync", ...rsyncArgs])
  if (!rsyncCommand.success) {
    error("Rsync failed")
    error(rsyncCommand.error)
    Deno.exit(1)
  }
  success("Synced completed successfully")

  // Run docker compose on remote server
  // First, ensure proxy network exists
  log("Ensuring proxy network exists on remote server...")
  const createNetworkCmd =
    `docker network inspect proxy >/dev/null 2>&1 || docker network create proxy`

  const networkCommand = await runCommand(["ssh", SSH_ADDRESS, createNetworkCmd])
  if (!networkCommand.success) {
    error("Failed to create proxy network on remote server")
    error(networkCommand.error)
    Deno.exit(1)
  }
  success("Proxy network ensured")

  // Deploy shared stacks
  if (sharedStacks.length > 0) {
    log("Deploying shared stacks...")
    for (const stack of sharedStacks) {
      log(`${stack}...`)
      const sharedStackCmd =
        `cd ${PATH_APPS} && docker compose --env-file=.env.root --env-file=.env -f sharedStacks/${stack}/compose.yml up -d`
      const sharedStackCommand = await runCommand(["ssh", SSH_ADDRESS, sharedStackCmd])
      if (!sharedStackCommand.success) {
        error(`Failed to deploy shared stack: ${stack}`)
        error(sharedStackCommand.error)
        Deno.exit(1)
      }
      success(`✓ ${stack}`)
    }
  } else {
    log("No shared stacks to deploy")
  }

  // Deploy local stacks first (each in its own directory to maintain isolation)
  if (localStacks.length > 0) {
    const LOCAL_STACKS_PATH = `${PATH_APPS}/localStacks`
    log("Deploying local stacks...")
    for (const stack of localStacks) {
      log(`${stack}...`)

      const localStackCmd =
        `cd ${LOCAL_STACKS_PATH}/${stack} && docker compose --env-file=../../.env.root --env-file=../../.env up -d`
      const localStackCommand = await runCommand(["ssh", SSH_ADDRESS, localStackCmd])
      if (!localStackCommand.success) {
        error(`Failed to deploy local stack: ${stack}`)
        error(localStackCommand.error)
        Deno.exit(1)
      }
      success(`✓ ${stack}`)
    }
  }

  const doesComposeYmlExist = await Deno.stat(`${tempDir}/compose.yml`).then(() => true).catch(() =>
    false
  )
  if (!doesComposeYmlExist) {
    log("No compose.yml found for main services, skipping...")
  } else {
    // Deploy main services with shared stacks
    log("Deploying compose.yml...")

    const remoteCmd =
      `cd ${PATH_APPS} && docker compose --env-file=.env.root --env-file=.env -f compose.yml up -d`

    const sshCommand = await runCommand(["ssh", SSH_ADDRESS, remoteCmd])
    if (!sshCommand.success) {
      error("Failed to deploy main services")
      error(sshCommand.error)
      Deno.exit(1)
    }
    success("✓ compose.yml")
  }

  log("Deployment script finished")
} finally {
  // Clean up temp directory
  try {
    await Deno.remove(tempDir, { recursive: true })
    log(`Cleaned up temporary directory`)
  } catch (err) {
    log(`Warning: Failed to clean up temp directory: ${err}`)
  }
}

// Helper function to recursively copy a directory
async function copyDirectory(src: string, dest: string): Promise<void> {
  // Create destination directory if it doesn't exist
  await Deno.mkdir(dest, { recursive: true })

  for await (const entry of Deno.readDir(src)) {
    const srcPath = `${src}/${entry.name}`
    const destPath = `${dest}/${entry.name}`

    if (entry.isDirectory) {
      await copyDirectory(srcPath, destPath)
    } else if (entry.isFile) {
      await Deno.copyFile(srcPath, destPath)
    }
  }
}
