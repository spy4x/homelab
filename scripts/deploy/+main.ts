// Deploy script that copies server files and stacks, then spins up docker compose
// Usage: deno run -A scripts/deploy/+main.ts <target>
// Example: deno run -A scripts/deploy/+main.ts offsite

import { error, log, runCommand, success } from "../+lib.ts"
import { load } from "@std/dotenv"

interface StackConfig {
  name: string
  deployAs?: string
  envs?: Record<string, string>
}

interface DeployResult {
  name: string
  deployAs: string
  success: boolean
  error?: string
}

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
const VOLUMES_PATH = targetEnv["VOLUMES_PATH"]
const HOMELAB_USER = targetEnv["HOMELAB_USER"] || "spy4x"

if (!SSH_ADDRESS || !PATH_APPS) {
  error(`SSH_ADDRESS and PATH_APPS must be set in ${targetEnvPath}`)
  Deno.exit(1)
}

// Load target's config.json to get required stacks
const configPath = `${targetPath}/config.json`
let config: { stacks?: StackConfig[] } = {}
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
  const whitelist = [".env", "configs/"]
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
    const envs = stackConfig.envs || {}

    // fill placeholders in envs
    for (const [key, value] of Object.entries(envs)) {
      if (typeof value !== "string") {
        error(`Invalid env value for key '${key}' in stack '${stackName}', must be a string`)
        continue
      }
      const filledValue = value.replace(/\${([^}]+)}/g, (_match, envVarName) => {
        const envValue = targetEnv[envVarName.trim()]
        if (envValue === undefined) {
          error(
            `Environment variable '${envVarName.trim()}' not found for stack '${stackName}'`,
          )
          return _match
        }
        return envValue
      })

      // add env to .env file in tempDir, but only if not already present
      const envFilePath = `${tempDir}/.env`
      let envFileContent = await Deno.readTextFile(envFilePath)
      if (!envFileContent.includes(`${key}=`)) {
        envFileContent += `\n${key}=${filledValue}\n`
        await Deno.writeTextFile(envFilePath, envFileContent)
        log(`Added env ${key} for stack ${stackName} to .env file`)
      }
    }

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

  // Deploy stacks in a single SSH session
  if (stacks.length > 0) {
    log("Deploying stacks...")

    // Extract volume paths from compose files and create them on the remote server
    const volumePaths = await extractVolumePaths(stacks, tempDir, targetEnv)
    if (volumePaths.length > 0 && VOLUMES_PATH) {
      log(`Creating ${volumePaths.length} volume directories with correct ownership...`)
      const createVolumesScript = generateVolumeCreationScript(volumePaths, HOMELAB_USER)
      const volumesCommand = await runCommand(["ssh", SSH_ADDRESS, createVolumesScript])
      if (!volumesCommand.success) {
        log(`Warning: Some volume directories may not have been created: ${volumesCommand.error}`)
      } else {
        success("Volume directories created")
      }
    }

    // Build a single script that deploys all stacks and tracks results
    const deployScript = generateDeployScript(stacks, PATH_APPS)

    // Execute the deploy script in a single SSH session
    const deployCommand = await runCommand(["ssh", SSH_ADDRESS, deployScript])

    // Parse the results from the output
    const results = parseDeployResults(deployCommand.output, stacks)

    // Print summary
    printDeploySummary(results)

    // Check if any failed
    const failedCount = results.filter((r) => !r.success).length
    if (failedCount > 0) {
      error(`${failedCount} stack(s) failed to deploy`)
      // Don't exit immediately - we want to show the full summary
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

/**
 * Extract volume paths from compose files that need to be created
 */
async function extractVolumePaths(
  stacks: StackConfig[],
  tempDir: string,
  env: Record<string, string>,
): Promise<string[]> {
  const volumePaths: Set<string> = new Set()

  for (const stackConfig of stacks) {
    const stackName = stackConfig.name
    const composePath = `${tempDir}/stacks/${stackName}/compose.yml`

    try {
      const composeContent = await Deno.readTextFile(composePath)

      // Extract volume mount paths that use VOLUMES_PATH
      // Pattern: ${VOLUMES_PATH}/something:/container/path
      const volumeMatches = composeContent.matchAll(/\$\{VOLUMES_PATH\}\/([^:]+):/g)

      for (const match of volumeMatches) {
        const volumeSubPath = match[1].split(":")[0] // Get just the path part
        // Expand any env vars in the path
        let expandedPath = `\${VOLUMES_PATH}/${volumeSubPath}`
        expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (_m, varName) => {
          return env[varName.trim()] || `\${${varName}}`
        })
        volumePaths.add(expandedPath)
      }
    } catch {
      // Compose file not found, skip
    }
  }

  return Array.from(volumePaths)
}

/**
 * Generate a shell script to create volume directories with correct ownership
 */
function generateVolumeCreationScript(volumePaths: string[], user: string): string {
  const commands = volumePaths.map((path) => {
    // Create directory and set ownership (ignore errors for already existing dirs)
    return `mkdir -p "${path}" 2>/dev/null; chown -R ${user}:${user} "${path}" 2>/dev/null || true`
  })

  return commands.join(" && ")
}

/**
 * Generate a bash script that deploys all stacks and outputs structured results
 */
function generateDeployScript(stacks: StackConfig[], pathApps: string): string {
  const stackCommands: string[] = []

  for (const stackConfig of stacks) {
    const stackName = stackConfig.name
    const deployAs = stackConfig.deployAs || stackName
    const projectFlag = `-p ${deployAs}`

    // Each stack deployment outputs a marker for parsing
    stackCommands.push(`
echo "DEPLOY_START:${stackName}:${deployAs}"
cd ${pathApps} && docker compose ${projectFlag} --env-file=.env.root --env-file=.env -f stacks/${stackName}/compose.yml up -d 2>&1
if [ $? -eq 0 ]; then
  echo "DEPLOY_SUCCESS:${stackName}:${deployAs}"
else
  echo "DEPLOY_FAILED:${stackName}:${deployAs}"
fi
`)
  }

  return stackCommands.join("\n")
}

/**
 * Parse the deploy output to extract results for each stack
 */
function parseDeployResults(output: string, stacks: StackConfig[]): DeployResult[] {
  const results: DeployResult[] = []
  const lines = output.split("\n")

  for (const stackConfig of stacks) {
    const stackName = stackConfig.name
    const deployAs = stackConfig.deployAs || stackName

    // Find the result marker for this stack
    const successMarker = `DEPLOY_SUCCESS:${stackName}:${deployAs}`
    const failedMarker = `DEPLOY_FAILED:${stackName}:${deployAs}`

    const isSuccess = lines.some((line) => line.includes(successMarker))
    const isFailed = lines.some((line) => line.includes(failedMarker))

    // Extract error output between START and SUCCESS/FAILED markers
    let errorOutput = ""
    if (isFailed) {
      const startIdx = lines.findIndex((l) => l.includes(`DEPLOY_START:${stackName}:${deployAs}`))
      const endIdx = lines.findIndex((l) => l.includes(failedMarker))
      if (startIdx !== -1 && endIdx !== -1) {
        errorOutput = lines.slice(startIdx + 1, endIdx).join("\n")
      }
    }

    results.push({
      name: stackName,
      deployAs,
      success: isSuccess && !isFailed,
      error: isFailed ? errorOutput : undefined,
    })
  }

  return results
}

/**
 * Print a summary of deployment results
 */
function printDeploySummary(results: DeployResult[]): void {
  log("\n========== DEPLOYMENT SUMMARY ==========")

  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  if (successful.length > 0) {
    success(`\n✅ Successful (${successful.length}/${results.length}):`)
    for (const result of successful) {
      const displayName = result.deployAs !== result.name
        ? `${result.name} (as ${result.deployAs})`
        : result.name
      log(`   ✓ ${displayName}`)
    }
  }

  if (failed.length > 0) {
    error(`\n❌ Failed (${failed.length}/${results.length}):`)
    for (const result of failed) {
      const displayName = result.deployAs !== result.name
        ? `${result.name} (as ${result.deployAs})`
        : result.name
      log(`   ✗ ${displayName}`)
      if (result.error) {
        log(
          `     Error: ${result.error.substring(0, 200)}${result.error.length > 200 ? "..." : ""}`,
        )
      }
    }
  }

  log("\n=========================================")
  log(`Total: ${results.length} | Success: ${successful.length} | Failed: ${failed.length}`)
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
