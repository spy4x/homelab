import { logError, logInfo } from "./+lib.ts"
import { BackupConfigState, BackupResult, BackupStatus } from "./types.ts"

export class BackupReporter {
  private ntfyUrl?: string
  private ntfyAuth?: string

  constructor(ntfyUrl?: string, ntfyAuth?: string) {
    this.ntfyUrl = ntfyUrl
    this.ntfyAuth = ntfyAuth
  }

  /**
   * Sends a comprehensive backup report via ntfy
   */
  async sendNotification(result: BackupResult): Promise<void> {
    if (!this.ntfyUrl) {
      logError("ntfy URL not configured, skipping notification")
      return
    }

    const ntfySuccess = await this.sendNtfyNotification(result)
    if (ntfySuccess) {
      logInfo("ntfy notification sent successfully")
    } else {
      logError("ntfy notification failed")
    }
  }

  /**
   * Sends notification via ntfy
   */
  private async sendNtfyNotification(result: BackupResult): Promise<boolean> {
    try {
      const { successCount, totalCount } = result
      const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(0) : "0"

      // Headers must be ASCII-only (no emojis)
      const title = `Homelab Backup: ${successCount}/${totalCount} (${successRate}%)`
      const message = this.buildNtfyMessage(result)

      const headers: Record<string, string> = {
        "Title": title,
        "Priority": successCount === totalCount ? "default" : "high",
        "Tags": successCount === totalCount
          ? "white_check_mark,floppy_disk"
          : "warning,floppy_disk",
      }

      if (this.ntfyAuth) {
        headers["Authorization"] = `Bearer ${this.ntfyAuth}`
      }

      const response = await fetch(this.ntfyUrl!, {
        method: "POST",
        headers,
        body: message,
      })

      return response.ok
    } catch (err) {
      logError(`Failed to send ntfy notification: ${err}`)
      return false
    }
  }

  /**
   * Builds the ntfy message body
   */
  private buildNtfyMessage(result: BackupResult): string {
    const { backups, totalSizeGB, durationMs } = result
    const sortedBackups = this.sortBackupsBySize(backups, totalSizeGB)

    // Format duration
    const durationMinutes = Math.floor(durationMs / 60000)
    const durationSeconds = Math.floor((durationMs % 60000) / 1000)
    const durationText = durationMinutes > 0
      ? `${durationMinutes}m ${durationSeconds}s`
      : `${durationSeconds}s`

    // Start with emoji in the message body (not in headers)
    let message = `🏠 Homelab Backup Complete\n💾 Total: ${
      totalSizeGB.toFixed(2)
    } GB\n⏱️ Duration: ${durationText}\n\n`

    // Add table - limit to top 10 for ntfy to keep message short
    const displayBackups = sortedBackups.slice(0, 10)
    for (const backup of displayBackups) {
      const statusEmoji = backup.status === BackupStatus.SUCCESS ? "✅" : "❌"
      const { size } = this.formatBackupSize(backup, totalSizeGB)
      const duration = this.formatDuration(backup.durationMs)
      message += `${statusEmoji} ${backup.name}: ${size} (${duration})\n`
    }

    // Add indication if there are more backups
    if (sortedBackups.length > 10) {
      message += `\n...and ${sortedBackups.length - 10} more\n`
    }

    // Add errors if any
    const failedBackups = backups.filter((b) => b.status === BackupStatus.ERROR)
    if (failedBackups.length > 0) {
      message += "\n⚠️ Errors:\n"
      for (const backup of failedBackups) {
        if (backup.error) {
          message += `• ${backup.name}: ${backup.error}\n`
        }
      }
    }

    return message
  }

  /**
   * Prints a detailed console report of the backup results
   */
  printConsoleReport(result: BackupResult): void {
    const { backups, successCount, totalCount, totalSizeGB, durationMs } = result

    // Format duration
    const durationMinutes = Math.floor(durationMs / 60000)
    const durationSeconds = Math.floor((durationMs % 60000) / 1000)

    logInfo(`--------- Backups finished: ${successCount} / ${totalCount} successful ---------`)
    logInfo(`Duration: ${durationMinutes}m ${durationSeconds}s`)

    // Print size summary
    this.printSizeSummary(backups, totalSizeGB)

    // Print detailed table
    this.printBackupTable(backups, totalSizeGB)
  }

  /**
   * Prints a summary of backup sizes
   */
  private printSizeSummary(backups: BackupConfigState[], totalSizeGB: number): void {
    const backupsWithSize = backups.filter((b) => b.sizeGB !== undefined)
    const sizeErrors = backups.filter((b) => b.sizeError).length

    if (backupsWithSize.length > 0) {
      logInfo(`Total backup size: ${totalSizeGB.toFixed(2)} GB`)
      if (sizeErrors > 0) {
        logInfo(`Size calculation errors: ${sizeErrors} repositories`)
      }
    } else if (sizeErrors > 0) {
      logInfo(`Size calculation failed for all ${sizeErrors} repositories`)
    }
  }

  /**
   * Prints a formatted table of backup results
   */
  private printBackupTable(backups: BackupConfigState[], totalSizeGB: number): void {
    // Sort backups by percentage descending
    const sortedBackups = this.sortBackupsBySize(backups, totalSizeGB)

    logInfo("Status | Name                 | %     | Size      | Time")
    logInfo("-------|----------------------|-------|-----------|-------")

    for (const backup of sortedBackups) {
      const statusEmoji = backup.status === BackupStatus.SUCCESS ? "✅" : "❌"
      const name = backup.name.padEnd(20, " ").substring(0, 20)
      const { percentage, size } = this.formatBackupSize(backup, totalSizeGB)
      const duration = this.formatDuration(backup.durationMs)

      logInfo(`${statusEmoji}     | ${name} | ${percentage} | ${size.padEnd(9)} | ${duration}`)
    }
  }

  /**
   * Sorts backups by size percentage in descending order
   */
  private sortBackupsBySize(
    backups: BackupConfigState[],
    totalSizeGB: number,
  ): BackupConfigState[] {
    return [...backups].sort((a, b) => {
      const aPercent = a.sizeGB !== undefined && totalSizeGB > 0
        ? (a.sizeGB / totalSizeGB) * 100
        : -1
      const bPercent = b.sizeGB !== undefined && totalSizeGB > 0
        ? (b.sizeGB / totalSizeGB) * 100
        : -1
      return bPercent - aPercent
    })
  }

  /**
   * Formats backup size information for display
   */
  private formatBackupSize(
    backup: BackupConfigState,
    totalSizeGB: number,
  ): { percentage: string; size: string } {
    if (backup.sizeGB !== undefined && totalSizeGB > 0) {
      const percent = ((backup.sizeGB / totalSizeGB) * 100).toFixed(1)
      return {
        percentage: `${percent}%`.padEnd(5, " "),
        size: `${backup.sizeGB.toFixed(2)} GB`,
      }
    } else if (backup.sizeGB !== undefined) {
      return {
        percentage: "N/A  ",
        size: `${backup.sizeGB.toFixed(2)} GB`,
      }
    } else if (backup.sizeError) {
      return {
        percentage: "ERR  ",
        size: "Error",
      }
    } else {
      return {
        percentage: "N/A  ",
        size: "N/A",
      }
    }
  }

  /**
   * Formats duration in milliseconds to human-readable string
   */
  private formatDuration(durationMs: number | undefined): string {
    if (durationMs === undefined) {
      return "N/A"
    }

    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
      return `${minutes}m${remainingSeconds}s`
    } else {
      return `${seconds}s`
    }
  }
}
