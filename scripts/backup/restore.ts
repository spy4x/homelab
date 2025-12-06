// Restore script for recovering service data from backups
// Usage: deno task backup:restore <service-name> [snapshot-id]
// Example: deno task backup:restore gatus
// Example: deno task backup:restore gatus a1b2c3d4

import { absPath, getEnvVar, logError, logInfo, PATH_APPS } from "./src/+lib.ts"
import { BackupConfigProcessor } from "./src/config.ts"

interface RestoreOptions {
  serviceName: string
  snapshotId?: string
  targetServer?: string
}

class RestoreRunner {
  private backupsPassword: string
  private backupsBasePath: string
  private configsPath: string

  constructor() {
    this.backupsPassword = getEnvVar("BACKUPS_PASSWORD")
    this.backupsBasePath = absPath(getEnvVar("PATH_SYNC") + "/backups")
    this.configsPath = absPath(`${PATH_APPS}/backup-configs`)
  }

  async run(options: RestoreOptions): Promise<void> {
    logInfo(`Starting restore for service: ${options.serviceName}`)

    // Load backup configs to find the service
    const configs = await BackupConfigProcessor.loadConfigurations(this.configsPath)
    const config = configs.find((c) => c.name === options.serviceName)

    if (!config) {
      logError(`Service "${options.serviceName}" not found in backup configs`)
      logInfo("Available services:")
      for (const c of configs) {
        logInfo(`  - ${c.name}${c.destName ? ` (backup: ${c.destName})` : ""}`)
      }
      Deno.exit(1)
    }

    const destName = config.destName || config.name
    const repoPath = `${this.backupsBasePath}/${destName}`

    // Check if repository exists
    if (!await this.checkRepository(repoPath)) {
      logError(`Backup repository not found at: ${repoPath}`)
      Deno.exit(1)
    }

    // List snapshots
    const snapshots = await this.listSnapshots(repoPath)
    if (snapshots.length === 0) {
      logError("No snapshots found in repository")
      Deno.exit(1)
    }

    // Select snapshot
    const snapshotId = options.snapshotId || snapshots[0].id
    const snapshot = snapshots.find((s) => s.id.startsWith(snapshotId))

    if (!snapshot) {
      logError(`Snapshot "${snapshotId}" not found`)
      Deno.exit(1)
    }

    logInfo(`Selected snapshot: ${snapshot.id} (${snapshot.time})`)

    // Confirm restore
    const confirm = prompt(
      `\nThis will restore ${config.name} from snapshot ${snapshot.id.substring(0, 8)}.\nType 'yes' to continue: `,
    )
    if (confirm?.toLowerCase() !== "yes") {
      logInfo("Restore cancelled")
      Deno.exit(0)
    }

    // Stop containers
    if (config.containers?.stop && config.containers.stop.length > 0) {
      logInfo("Stopping containers...")
      for (const container of config.containers.stop) {
        await this.stopContainer(container)
      }
    }

    // Restore from backup
    const tempRestorePath = await Deno.makeTempDir({ prefix: "restore_" })
    try {
      logInfo(`Restoring to temporary location: ${tempRestorePath}`)
      await this.restoreSnapshot(repoPath, snapshot.id, tempRestorePath)

      // Copy restored files to actual location
      for (const sourcePath of config.sourcePaths) {
        const actualPath = absPath(sourcePath)
        logInfo(`Copying restored files to: ${actualPath}`)

        // Backup existing data
        const backupPath = `${actualPath}.backup-${Date.now()}`
        logInfo(`Backing up existing data to: ${backupPath}`)
        await this.runCommand("mv", [actualPath, backupPath])

        // Copy restored data
        await this.runCommand("cp", ["-r", tempRestorePath, actualPath])

        // Fix permissions
        if (config.pathsToChangeOwnership && config.pathsToChangeOwnership.length > 0) {
          for (const path of config.pathsToChangeOwnership) {
            const actualPath = absPath(path)
            const user = getEnvVar("USER")
            logInfo(`Fixing permissions for: ${actualPath}`)
            await this.runCommand("chown", ["-R", `${user}:${user}`, actualPath])
          }
        }
      }

      logInfo("✅ Restore completed successfully!")
    } finally {
      // Cleanup temp directory
      await Deno.remove(tempRestorePath, { recursive: true })

      // Start containers
      if (config.containers?.stop && config.containers.stop.length > 0) {
        logInfo("Starting containers...")
        for (const container of config.containers.stop) {
          await this.startContainer(container)
        }
      }
    }

    logInfo("\nRestore verification:")
    logInfo("1. Check if the service is running: docker compose ps")
    logInfo("2. Check logs: docker compose logs -f <container-name>")
    logInfo("3. Test service functionality")
  }

  private async checkRepository(repoPath: string): Promise<boolean> {
    try {
      const stat = await Deno.stat(repoPath)
      return stat.isDirectory
    } catch {
      return false
    }
  }

  private async listSnapshots(
    repoPath: string,
  ): Promise<Array<{ id: string; time: string; host: string }>> {
    const cmd = new Deno.Command("restic", {
      args: ["-r", repoPath, "snapshots", "--json"],
      env: { RESTIC_PASSWORD: this.backupsPassword },
      stdout: "piped",
      stderr: "piped",
    })

    const output = await cmd.output()
    if (!output.success) {
      logError("Failed to list snapshots")
      logError(new TextDecoder().decode(output.stderr))
      Deno.exit(1)
    }

    const snapshots = JSON.parse(new TextDecoder().decode(output.stdout))
    return snapshots
      .reverse() // Most recent first
      .map((s: { short_id: string; time: string; hostname: string }) => ({
        id: s.short_id,
        time: s.time,
        host: s.hostname,
      }))
  }

  private async restoreSnapshot(
    repoPath: string,
    snapshotId: string,
    targetPath: string,
  ): Promise<void> {
    const cmd = new Deno.Command("restic", {
      args: ["-r", repoPath, "restore", snapshotId, "--target", targetPath],
      env: { RESTIC_PASSWORD: this.backupsPassword },
      stdout: "inherit",
      stderr: "inherit",
    })

    const output = await cmd.output()
    if (!output.success) {
      logError("Failed to restore snapshot")
      Deno.exit(1)
    }
  }

  private async stopContainer(containerName: string): Promise<void> {
    await this.runCommand("docker", ["compose", "stop", containerName])
  }

  private async startContainer(containerName: string): Promise<void> {
    await this.runCommand("docker", ["compose", "start", containerName])
  }

  private async runCommand(cmd: string, args: string[]): Promise<void> {
    const command = new Deno.Command(cmd, {
      args,
      stdout: "inherit",
      stderr: "inherit",
    })

    const output = await command.output()
    if (!output.success) {
      logError(`Command failed: ${cmd} ${args.join(" ")}`)
    }
  }
}

// Main execution
const args = Deno.args
if (args.length < 1) {
  console.log("Usage: deno task backup:restore <service-name> [snapshot-id]")
  console.log("Example: deno task backup:restore gatus")
  console.log("Example: deno task backup:restore gatus a1b2c3d4")
  console.log("")
  console.log("The service name should match the 'name' field in backup config.")
  Deno.exit(1)
}

const options: RestoreOptions = {
  serviceName: args[0],
  snapshotId: args[1],
}

const runner = new RestoreRunner()
await runner.run(options)
