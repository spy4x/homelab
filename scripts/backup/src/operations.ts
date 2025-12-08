import { absPath, logError, logInfo, USER } from "./+lib.ts"
import { BackupConfigState, BackupStatus, ResticCommandOptions } from "./types.ts"

export class BackupOperations {
  private backupsPassword: string

  constructor(backupsPassword: string) {
    this.backupsPassword = backupsPassword
  }

  /**
   * Starts or stops Docker containers for a backup configuration
   */
  async manageContainers(
    config: BackupConfigState,
    action: "start" | "stop",
  ): Promise<void> {
    if (!config.containers?.stop || config.containers.stop.length === 0) {
      return
    }

    for (const containerName of config.containers.stop) {
      logInfo(`${action}ing container ${containerName}`)

      const cmd = new Deno.Command("docker", {
        args: [action, containerName],
        stdout: "piped",
        stderr: "piped",
      })

      const { code, stderr } = await cmd.output()

      if (code !== 0) {
        const errorMsg = `Error ${action}ing container ${containerName}:\n${
          new TextDecoder().decode(stderr)
        }`
        this.markBackupFailed(config, errorMsg, `docker_${action}`)
        return
      }
    }
  }

  /**
   * Changes ownership of specified paths to the current user
   */
  async changeOwnership(config: BackupConfigState): Promise<void> {
    if (!config.pathsToChangeOwnership || config.pathsToChangeOwnership.length === 0) {
      return
    }

    for (const path of config.pathsToChangeOwnership) {
      const absolutePath = absPath(path)
      logInfo(`Changing ownership of ${absolutePath} to ${USER}:${USER}`)

      const cmd = new Deno.Command("sudo", {
        args: ["chown", "-R", `${USER}:${USER}`, absolutePath],
        stdout: "piped",
        stderr: "piped",
      })

      const { code, stderr } = await cmd.output()

      if (code !== 0) {
        const errorMsg = `Error changing ownership of ${path}:\n${new TextDecoder().decode(stderr)}`
        this.markBackupFailed(config, errorMsg, "chown")
        return
      }
    }

    logInfo("Ownership changed successfully")
  }

  /**
   * Performs the complete restic backup process
   */
  async performResticBackup(
    config: BackupConfigState,
    backupsOutputBasePath: string,
  ): Promise<void> {
    if (config.status === BackupStatus.ERROR) {
      return
    }

    const destName = config.destName || config.name
    const repoPath = absPath(`${backupsOutputBasePath}/${destName}`)

    // Check if repository exists and initialize if needed
    if (!(await this.ensureRepository(config, repoPath))) {
      return
    }

    // Verify integrity before backup
    if (
      !(await this.runResticCommand({
        args: ["check", "-r", repoPath],
        config,
        step: "check_integrity_before",
      }))
    ) {
      return
    }

    // Perform backup
    const backupArgs = [
      "backup",
      ...((config.sourcePaths as string[]).map((path) => absPath(path))),
      "-r",
      repoPath,
    ]
    if (!(await this.runResticCommand({ args: backupArgs, config, step: "backup" }))) {
      return
    }

    // Clean up old backups
    const forgetArgs = [
      "forget",
      "--prune",
      "--keep-daily", // last 7 daily backups
      "7",
      "--keep-weekly", // last 4 weekly backups
      "4",
      "--keep-monthly", // last 3 monthly backups
      "3",
      "--group-by",
      "paths,tags", // group by paths and tags to avoid treating different hosts as separate backups (i.e. when hostname changes)
      "-r",
      repoPath,
    ]
    if (!(await this.runResticCommand({ args: forgetArgs, config, step: "forget" }))) {
      return
    }

    // Verify integrity after backup
    if (
      !(await this.runResticCommand({
        args: ["check", "-r", repoPath],
        config,
        step: "check_integrity_after",
      }))
    ) {
      return
    }

    // Fix repository ownership for Syncthing sync
    // The cron job runs as root, so repos are created with root ownership
    // Change to user ownership so Syncthing can sync them
    await this.changeRepoOwnership(repoPath)
  }

  /**
   * Changes ownership of the backup repository to allow Syncthing sync
   */
  async changeRepoOwnership(repoPath: string): Promise<void> {
    logInfo(`Changing repository ownership to ${USER}:${USER}`)

    const cmd = new Deno.Command("sudo", {
      args: ["chown", "-R", `${USER}:${USER}`, repoPath],
      stdout: "piped",
      stderr: "piped",
    })

    const { code, stderr } = await cmd.output()

    if (code !== 0) {
      const errorMsg = `Warning: Could not change repository ownership:\n${
        new TextDecoder().decode(stderr)
      }`
      logError(errorMsg)
      // Don't fail the backup for this, just warn
    } else {
      logInfo("Repository ownership changed successfully")
    }
  }

  /**
   * Ensures the restic repository exists, initializing it if necessary
   */
  private async ensureRepository(config: BackupConfigState, repoPath: string): Promise<boolean> {
    // Try to check if repository exists
    const checkResult = await this.runResticCommand({
      args: ["-r", repoPath, "cat", "config"],
      config,
      step: "check",
    })

    if (checkResult) {
      return true
    }

    // Check if error indicates missing repository
    const lastError = config.error || ""
    const isMissingRepo = lastError.includes("is not a restic repository") ||
      lastError.includes("does not exist") ||
      lastError.includes("no such file or directory")

    if (!isMissingRepo) {
      return false
    }

    // Initialize repository
    logInfo(`Restic repo does not exist at ${repoPath}, initializing...`)
    config.error = `Restic repo does not exist at ${repoPath}, will initialize it.`

    if (!(await this.runResticCommand({ args: ["init", "-r", repoPath], config, step: "init" }))) {
      return false
    }

    // Verify repository was created successfully
    return await this.runResticCommand({
      args: ["-r", repoPath, "cat", "config"],
      config,
      step: "check",
    })
  }

  /**
   * Runs a restic command and handles the response
   */
  private async runResticCommand(options: ResticCommandOptions): Promise<boolean> {
    const { args, config, step } = options

    const cmd = new Deno.Command("restic", {
      args,
      stdout: "piped",
      stderr: "piped",
      env: {
        ...Deno.env.toObject(),
        RESTIC_PASSWORD: this.backupsPassword,
      },
    })

    const { code, stdout, stderr } = await cmd.output()
    const outStr = new TextDecoder().decode(stdout)
    const errStr = new TextDecoder().decode(stderr)

    if (code === 0) {
      logInfo(`Restic ${step} succeeded`)
      return true
    }

    // Handle different restic exit codes
    const errorMsg = this.getResticErrorMessage(code, errStr, outStr)
    this.markBackupFailed(config, `${errorMsg} ${errStr}`, `restic_${step}`)
    return false
  }

  /**
   * Gets a human-readable error message for restic exit codes
   */
  private getResticErrorMessage(code: number, errStr: string, outStr: string): string {
    const baseError = errStr || outStr || `Restic exited with code ${code}`

    switch (code) {
      case 1:
        return baseError || "Restic command failed (code 1)"
      case 2:
        return "Go runtime error (code 2)"
      case 3:
        return "Backup could not read some source data (code 3)"
      case 10:
        return "Repository does not exist (code 10)"
      case 11:
        return "Failed to lock repository (code 11)"
      case 12:
        return "Wrong password for repository (code 12)"
      case 130:
        return "Restic was interrupted (code 130)"
      default:
        return baseError || `Restic failed with exit code ${code}`
    }
  }

  /**
   * Calculates the size of backup repositories
   */
  async calculateRepositorySizes(
    backups: BackupConfigState[],
    backupsOutputBasePath: string,
  ): Promise<void> {
    for (const backup of backups) {
      try {
        const destName = backup.destName || backup.name
        const repoPath = absPath(`${backupsOutputBasePath}/${destName}`)

        // Check if repository directory exists
        if (!(await this.isValidRepository(backup, repoPath))) {
          continue
        }

        // Calculate directory size using du command
        const sizeBytes = await this.getDirectorySize(repoPath)
        if (sizeBytes === null) {
          backup.sizeError = "Failed to calculate directory size"
          logError(`Repository ${backup.name}: failed to calculate size`)
          continue
        }

        // Convert bytes to GB
        backup.sizeGB = sizeBytes / (1024 * 1024 * 1024)
        logInfo(`Repository ${backup.name}: ${backup.sizeGB.toFixed(2)} GB`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        backup.sizeError = `Unexpected error: ${errorMsg}`
        logError(`Repository ${backup.name}: unexpected error calculating size - ${errorMsg}`)
      }
    }
  }

  /**
   * Checks if a repository path is valid
   */
  private async isValidRepository(backup: BackupConfigState, repoPath: string): Promise<boolean> {
    try {
      const stat = Deno.statSync(repoPath)
      if (!stat.isDirectory) {
        backup.sizeError = "Not a directory"
        logError(`Repository ${backup.name}: path exists but is not a directory`)
        return false
      }
      return true
    } catch {
      backup.sizeError = "Repository not found"
      logError(`Repository ${backup.name}: directory does not exist at ${repoPath}`)
      return false
    }
  }

  /**
   * Gets the size of a directory in bytes using du command
   */
  private async getDirectorySize(path: string): Promise<number | null> {
    const cmd = new Deno.Command("du", {
      args: ["-sb", path], // -s for summary, -b for bytes
      stdout: "piped",
      stderr: "piped",
    })

    const { code, stdout, stderr } = await cmd.output()

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr)
      logError(`du command failed: ${errorMsg}`)
      return null
    }

    const output = new TextDecoder().decode(stdout).trim()
    const sizeBytes = parseInt(output.split("\t")[0])

    if (isNaN(sizeBytes)) {
      logError(`Could not parse size from du output: ${output}`)
      return null
    }

    return sizeBytes
  }

  /**
   * Marks a backup as failed with error details
   */
  private markBackupFailed(backup: BackupConfigState, error: string, step: string): void {
    backup.status = BackupStatus.ERROR
    backup.error = error
    backup.errorAtStep = step
    logError(`[${step.toUpperCase()}] ${error}`)
  }
}
