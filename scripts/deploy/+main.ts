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
let config: { stacks?: Array<{ name: string; deployAs?: string }> } = {}
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

const stacks = config.stacks || []

// Create temporary directory for deployment files
const tempDir = await Deno.makeTempDir({ prefix: "deploy_" })
log(`Created temp dir: ${tempDir}`)

try {
  // Copy server folder contents to temp directory
  const whitelist = [".env", "configs/", "stacks/"]
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

  // Copy required stacks to temp directory
  if (stacks.length > 0) {
    await Deno.mkdir(`${tempDir}/stacks`, { recursive: true })
    for (const stackConfig of stacks) {
      const stackName = stackConfig.name
      const stackPath = `./stacks/${stackName}`
      const destPath = `${tempDir}/stacks/${stackName}`

      try {
        await copyDirectory(stackPath, destPath)
        log(` + /stacks/${stackName}`)
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          error(`Stack not found: ${stackPath}`)
          Deno.exit(1)
        }
        throw err
      }
    }
  }

  // Handle "before.deploy.ts" scripts for stacks
  for (const stackConfig of stacks) {
    const stackName = stackConfig.name
    const deployAs = stackConfig.deployAs || stackName

    // Check for stack-level before.deploy.ts
    const stackBeforeDeployPath = `${tempDir}/stacks/${stackName}/before.deploy.ts`
    const hasStackBeforeDeploy = await Deno.stat(stackBeforeDeployPath).then(() => true).catch(() =>
      false
    )
    if (hasStackBeforeDeploy) {
      log(`Running before.deploy.ts for stack ${stackName}...`)
      const proc = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-R",
          "-W",
          "-E",
          "--env-file=.env.root",
          "--env-file=.env",
          stackBeforeDeployPath,
        ],
        cwd: tempDir,
        env: { DEPLOY_AS: deployAs },
      })
      const output = await proc.output()
      if (output.code !== 0) {
        error(`before.deploy.ts failed for stack: ${stackName}`)
        error(new TextDecoder().decode(output.stderr))
        Deno.exit(1)
      }
      success(`✓ before.deploy.ts for ${stackName}`)
    }

    // Check for server-specific before.deploy.ts
    const serverBeforeDeployPath = `${tempDir}/configs/${deployAs}/before.deploy.ts`
    const hasServerBeforeDeploy = await Deno.stat(serverBeforeDeployPath).then(() => true).catch(
      () => false,
    )
    if (hasServerBeforeDeploy) {
      log(`Running server-specific before.deploy.ts for ${deployAs}...`)
      const proc = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-R",
          "-W",
          "-E",
          "--env-file=.env.root",
          "--env-file=.env",
          serverBeforeDeployPath,
        ],
        cwd: tempDir,
      })
      const output = await proc.output()
      if (output.code !== 0) {
        error(`server-specific before.deploy.ts failed for: ${deployAs}`)
        error(new TextDecoder().decode(output.stderr))
        Deno.exit(1)
      }
      success(`✓ server-specific before.deploy.ts for ${deployAs}`)
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

  // Deploy stacks
  if (stacks.length > 0) {
    log("Deploying stacks...")
    for (const stackConfig of stacks) {
      const stackName = stackConfig.name
      const deployAs = stackConfig.deployAs || stackName
      log(`${stackName}${deployAs !== stackName ? ` (as ${deployAs})` : ""}...`)

      // Use project name to allow same stack deployed multiple times
      const projectFlag = `-p ${deployAs}`
      const stackCmd =
        `cd ${PATH_APPS} && docker compose ${projectFlag} --env-file=.env.root --env-file=.env -f stacks/${stackName}/compose.yml up -d`
      const stackCommand = await runCommand(["ssh", SSH_ADDRESS, stackCmd])
      if (!stackCommand.success) {
        error(
          `Failed to deploy stack: ${stackName}${
            deployAs !== stackName ? ` (as ${deployAs})` : ""
          }`,
        )
        error(stackCommand.error)
        Deno.exit(1)
      }
      success(`✓ ${stackName}${deployAs !== stackName ? ` (as ${deployAs})` : ""}`)
    }
  } else {
    log("No stacks to deploy")
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
