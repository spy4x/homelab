// Deploy script that copies server files and stacks, then spins up docker compose
// Usage: deno run -A scripts/deploy/+main.ts <target>
// Example: deno run -A scripts/deploy/+main.ts offsite

import { error, loadEnvFile, log, success } from "../+lib.ts"

// Parse command line arguments
const args = Deno.args
if (args.length < 1) {
  error("Usage: deno run -A scripts/deploy/+main.ts <target>")
  error("Example: deno run -A scripts/deploy/+main.ts offsite")
  Deno.exit(1)
}

const target = args[0]

// Validate target
const validTargets = ["home", "offsite", "cloud"]
if (!validTargets.includes(target)) {
  error(`Invalid target: ${target}. Must be one of: ${validTargets.join(", ")}`)
  Deno.exit(1)
}

const targetPath = `./servers/${target}`

// Load target's .env file to get SSH_ADDRESS and PATH_APPS
const targetEnvPath = `${targetPath}/.env`
const targetEnv = await loadEnvFile(targetEnvPath)

const SSH_ADDRESS = targetEnv["SSH_ADDRESS"]
const PATH_APPS = targetEnv["PATH_APPS"]

if (!SSH_ADDRESS || !PATH_APPS) {
  error(`SSH_ADDRESS and PATH_APPS must be set in ${targetEnvPath}`)
  Deno.exit(1)
}

// Load target's config.json to get required stacks
const configPath = `${targetPath}/config.json`
let config: { sharedStacks?: string[]; localStacks?: string[] } = {}
try {
  const configContent = await Deno.readTextFile(configPath)
  config = JSON.parse(configContent)
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    log(`Warning: ${configPath} not found, proceeding without stacks`)
  } else {
    throw err
  }
}

const sharedStacks = config.sharedStacks || []
const localStacks = config.localStacks || []

// Create temporary directory for deployment files
const tempDir = await Deno.makeTempDir({ prefix: "deploy_" })
log(`Created temporary directory: ${tempDir}`)

try {
  // Copy server folder contents to temp directory
  log(`Copying ${targetPath}/* to temp directory...`)
  await copyDirectory(targetPath, tempDir)

  // Copy root .env file to temp directory
  log(`Copying root .env to temp directory...`)
  await Deno.copyFile("./.env", `${tempDir}/.env.root`)

  // Copy scripts folder to temp directory
  log(`Copying ./scripts to temp directory...`)
  await copyDirectory("./scripts", `${tempDir}/scripts`)

  // Copy deno.jsonc to temp directory
  log(`Copying ./deno.jsonc to temp directory...`)
  await Deno.copyFile("./deno.jsonc", `${tempDir}/deno.jsonc`)

  // Merge root .env and target .env into a single .env file
  const rootEnv = await loadEnvFile("./.env")
  const mergedEnvContent = [
    "# Merged environment variables from root and target",
    ...Object.entries({ ...rootEnv, ...targetEnv }).map(([key, value]) => `${key}=${value}`),
  ].join("\n")
  await Deno.writeTextFile(`${tempDir}/.env`, mergedEnvContent)
  log(`Created merged .env file with ${Object.keys({ ...rootEnv, ...targetEnv }).length} variables`)

  // Copy required shared stacks to temp directory
  if (sharedStacks.length > 0) {
    log(`Copying shared stacks: ${sharedStacks.join(", ")}`)
    for (const stack of sharedStacks) {
      const stackPath = `./stacks/${stack}.yml`
      const destPath = `${tempDir}/${stack}.yml`

      try {
        await Deno.copyFile(stackPath, destPath)
        log(`  ✓ Copied ${stack}.yml`)
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          error(`Stack file not found: ${stackPath}`)
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

  const rsyncCommand = new Deno.Command("rsync", {
    args: rsyncArgs,
    stdout: "inherit",
    stderr: "inherit",
  })
  const rsyncResult = await rsyncCommand.output()

  if (rsyncResult.code !== 0) {
    error("rsync failed")
    Deno.exit(rsyncResult.code)
  }

  // Run docker compose on remote server
  // First, ensure proxy network exists
  log("Ensuring proxy network exists on remote server...")
  const createNetworkCmd =
    `docker network inspect proxy >/dev/null 2>&1 || docker network create proxy`

  const networkCommand = new Deno.Command("ssh", {
    args: [SSH_ADDRESS, createNetworkCmd],
    stdout: "inherit",
    stderr: "inherit",
  })
  await networkCommand.output()

  // Deploy services using multiple -f flags to compose stacks without merging/concatenating
  // This preserves relative paths and allows server compose.yml to override stack settings
  log("Starting Docker Compose on remote server...")

  // Build compose file arguments: start with shared stacks, add local stacks, end with server's compose.yml for overrides
  const composeFileArgs = [
    ...sharedStacks.map((stack) => `-f ${stack}.yml`),
    ...localStacks.map((stack) => `-f ${stack}/compose.yml`),
    "-f compose.yml",
  ].join(" ")

  const remoteCmd =
    `cd ${PATH_APPS} && docker compose --env-file .env ${composeFileArgs} up -d --remove-orphans`

  const sshCommand = new Deno.Command("ssh", {
    args: [SSH_ADDRESS, remoteCmd],
    stdout: "inherit",
    stderr: "inherit",
  })
  const sshResult = await sshCommand.output()

  if (sshResult.code !== 0) {
    error("Remote Docker Compose command failed")
    Deno.exit(sshResult.code)
  }

  success("Deploy completed successfully!")
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
