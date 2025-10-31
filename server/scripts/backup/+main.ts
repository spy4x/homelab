import { absPath, getEnvVar, logInfo, PATH_APPS } from "./src/+lib.ts"
import { BackupConfigProcessor } from "./src/config.ts"
import { BackupOperations } from "./src/operations.ts"
import { BackupReporter } from "./src/reporting.ts"
import { BackupConfigState, BackupContext, BackupResult, BackupStatus } from "./src/types.ts"

/**
 * Main backup orchestration class
 */
class BackupRunner {
  private context: BackupContext
  private operations: BackupOperations
  private reporter: BackupReporter

  constructor() {
    this.context = this.initializeContext()
    this.operations = new BackupOperations(this.context.backupsPassword)
    this.reporter = new BackupReporter(
      this.context.slackWebhookUrl,
      this.context.ntfyUrl,
      this.context.ntfyAuth,
    )
  }

  /**
   * Main entry point for running the backup process
   */
  async run(): Promise<void> {
    const startTime = Date.now()
    logInfo(`[${new Date().toISOString()}] Starting backup process`)

    try {
      // Load and validate configurations
      const backups = await this.loadConfigurations()

      if (backups.length === 0) {
        console.error("No backup configs found")
        await this.reporter.sendNotification(this.createEmptyResult(0))
        Deno.exit(1)
      }

      // Process each backup
      await this.processBackups(backups)

      // Calculate repository sizes
      logInfo("--------- Calculating repository sizes ---------")
      await this.operations.calculateRepositorySizes(backups, this.context.backupsOutputBasePath)

      // Calculate total duration
      const durationMs = Date.now() - startTime
      const durationMinutes = Math.floor(durationMs / 60000)
      const durationSeconds = Math.floor((durationMs % 60000) / 1000)

      logInfo(
        `--------- Total backup duration: ${durationMinutes}m ${durationSeconds}s ---------`,
      )

      // Generate and send report
      const result = this.buildResult(backups, durationMs)
      this.reporter.printConsoleReport(result)
      await this.reporter.sendNotification(result)

      // Exit with appropriate code
      const failedCount = result.totalCount - result.successCount
      if (failedCount > 0) {
        Deno.exit(1)
      }
    } catch (error) {
      console.error("Fatal error during backup process:", error)
      Deno.exit(1)
    }
  }

  /**
   * Initializes the backup context with environment variables
   */
  private initializeContext(): BackupContext {
    return {
      backupsOutputBasePath: absPath(getEnvVar("PATH_SYNC") + "/backups"),
      backupsPassword: getEnvVar("BACKUPS_PASSWORD"),
      slackWebhookUrl: getEnvVar("SLACK_WEBHOOK_URL"),
      ntfyUrl: getEnvVar("NTFY_URL"),
      ntfyAuth: getEnvVar("NTFY_AUTH_TOKEN"),
      configsPath: absPath(`${PATH_APPS}/scripts/backup/configs`),
    }
  }

  /**
   * Loads all backup configurations from the configs directory
   */
  private async loadConfigurations(): Promise<BackupConfigState[]> {
    return await BackupConfigProcessor.loadConfigurations(this.context.configsPath)
  }

  /**
   * Processes all backup configurations
   */
  private async processBackups(backups: BackupConfigState[]): Promise<void> {
    for (const backup of backups) {
      const backupStartTime = Date.now()
      logInfo(`--------- ${backup.name} ---------`)

      // Skip if configuration is already failed
      if (backup.status === BackupStatus.ERROR) {
        continue
      }

      // Validate configuration
      if (!BackupConfigProcessor.validateAndNormalize(backup)) {
        continue
      }

      // Execute backup workflow
      await this.executeBackupWorkflow(backup)

      // Mark as successful if no errors occurred
      if (backup.status === BackupStatus.IN_PROGRESS) {
        backup.status = BackupStatus.SUCCESS
      }

      // Record duration
      backup.durationMs = Date.now() - backupStartTime
      const durationSeconds = (backup.durationMs / 1000).toFixed(1)
      logInfo(`Completed in ${durationSeconds}s`)
    }
  }

  /**
   * Executes the complete backup workflow for a single backup
   */
  private async executeBackupWorkflow(backup: BackupConfigState): Promise<void> {
    try {
      // Stop containers
      await this.operations.manageContainers(backup, "stop")

      if (this.isBackupFailed(backup)) return

      // Change ownership
      await this.operations.changeOwnership(backup)

      if (this.isBackupFailed(backup)) return

      // Perform backup
      await this.operations.performResticBackup(backup, this.context.backupsOutputBasePath)

      if (this.isBackupFailed(backup)) return
    } catch (error) {
      backup.status = BackupStatus.ERROR
      backup.error = `Unexpected error: ${error}`
      backup.errorAtStep = "workflow"
    } finally {
      // Always restart containers, even if backup failed
      if (backup.containers?.stop && backup.containers.stop.length > 0) {
        await this.operations.manageContainers(backup, "start")
      }
    }
  }

  /**
   * Checks if a backup has failed
   */
  private isBackupFailed(backup: BackupConfigState): boolean {
    return backup.status === BackupStatus.ERROR
  }

  /**
   * Builds the final backup result
   */
  private buildResult(backups: BackupConfigState[], durationMs: number): BackupResult {
    const successCount = backups.filter((b) => b.status === BackupStatus.SUCCESS).length
    const backupsWithSize = backups.filter((b) => b.sizeGB !== undefined)
    const totalSizeGB = backupsWithSize.reduce((sum, backup) => sum + (backup.sizeGB || 0), 0)

    return {
      backups,
      successCount,
      totalCount: backups.length,
      totalSizeGB,
      durationMs,
    }
  }

  /**
   * Creates an empty result for when no configurations are found
   */
  private createEmptyResult(durationMs: number): BackupResult {
    return {
      backups: [],
      successCount: 0,
      totalCount: 0,
      totalSizeGB: 0,
      durationMs,
    }
  }
}

// Create and run the backup process
await new BackupRunner().run()
