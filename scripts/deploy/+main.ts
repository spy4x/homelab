// Deploy script that copies server files and stacks, then spins up docker compose
// Usage: deno run -A scripts/deploy/+main.ts <target>
// Example: deno run -A scripts/deploy/+main.ts offsite

import { error, log, success } from "../+lib.ts"

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
let config: { stacks?: string[] } = {}
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

const requiredStacks = config.stacks || []

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

  // Merge root .env and target .env into a single .env file
  const rootEnv = await loadEnvFile("./.env")
  const mergedEnvContent = [
    "# Merged environment variables from root and target",
    ...Object.entries({ ...rootEnv, ...targetEnv }).map(([key, value]) => `${key}=${value}`),
  ].join("\n")
  await Deno.writeTextFile(`${tempDir}/.env`, mergedEnvContent)
  log(`Created merged .env file with ${Object.keys({ ...rootEnv, ...targetEnv }).length} variables`)

  // Copy required stacks to temp directory
  if (requiredStacks.length > 0) {
    log(`Copying required stacks: ${requiredStacks.join(", ")}`)
    for (const stack of requiredStacks) {
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

  // Create a merged compose file that includes all stacks
  const mergedComposePath = `${tempDir}/docker-compose.yml`
  await createMergedCompose(tempDir, requiredStacks, mergedComposePath)

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
  // Using 'up -d' instead of 'down && up' to avoid recreating unchanged containers
  log("Starting Docker Compose on remote server...")
  const remoteCmd = `cd ${PATH_APPS} && docker compose -f docker-compose.yml up -d --remove-orphans`

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

// Helper function to load and parse .env file
async function loadEnvFile(path: string): Promise<Record<string, string>> {
  const content = await Deno.readTextFile(path)
  const env: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    // Parse key=value pairs
    const equalsIndex = trimmedLine.indexOf("=")
    if (equalsIndex === -1) {
      continue
    }

    const key = trimmedLine.substring(0, equalsIndex).trim()
    let value = trimmedLine.substring(equalsIndex + 1).trim()

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
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

// Helper function to create merged docker-compose.yml
async function createMergedCompose(
  tempDir: string,
  stacks: string[],
  outputPath: string,
): Promise<void> {
  // Check if the main compose file has any services defined
  const mainComposeContent = await Deno.readTextFile(`${tempDir}/compose.yml`)
  const hasServices = mainComposeContent.includes("services:") && 
                      !mainComposeContent.match(/services:\s*$/m)

  const composeFiles = []
  
  // Only include main compose if it has services
  if (hasServices) {
    composeFiles.push(`${tempDir}/compose.yml`)
  }
  
  // Add stack files
  composeFiles.push(...stacks.map((stack) => `${tempDir}/${stack}.yml`))

  if (composeFiles.length === 0) {
    error("No compose files to merge")
    Deno.exit(1)
  }

  // Build docker compose command that merges all files
  const mergeArgs = composeFiles.flatMap((file) => ["-f", file])

  // Use docker compose config to merge all compose files with --env-file
  const configCommand = new Deno.Command("docker", {
    args: ["compose", "--env-file", `${tempDir}/.env`, ...mergeArgs, "config"],
    stdout: "piped",
    stderr: "inherit",
  })

  const configResult = await configCommand.output()

  if (configResult.code !== 0) {
    error("Failed to merge compose files")
    Deno.exit(configResult.code)
  }

  // Write merged compose to output file
  await Deno.writeFile(outputPath, configResult.stdout)
  log(`Created merged docker-compose.yml with ${composeFiles.length} file(s)`)
}
