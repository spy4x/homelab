import { error, log } from "../../+lib.ts"
import { BackupConfigState, BackupContext, BackupResult, BackupStatus } from "./types.ts"

export class BackupReporter {
  constructor(private context: BackupContext) {}

  /**
   * Sends backup notifications via healthchecks and ntfy
   * Healthchecks is used for "dead man's switch" monitoring
   * ntfy is used for direct notifications
   */
  async sendNotification(result: BackupResult): Promise<void> {
    // Send healthchecks ping first (if configured)
    await this.sendHealthchecksPing(result)

    // Then send ntfy notification with retry logic
    const maxRetries = 5
    const retryDelayMs = 3000 // 3 seconds between retries

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const ntfySuccess = await this.sendNtfyNotification(result)
      if (ntfySuccess) {
        log("ntfy notification sent successfully to " + this.context.ntfyUrl)
        return
      }

      if (attempt < maxRetries) {
        log(
          `ntfy notification attempt ${attempt}/${maxRetries} failed, retrying in ${
            retryDelayMs / 1000
          }s...`,
        )
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }

    error(`ntfy notification failed after ${maxRetries} attempts to ` + this.context.ntfyUrl)
  }

  /**
   * Pings healthchecks.io-style endpoint
   * Uses /fail suffix if backup failed, otherwise pings success
   */
  private async sendHealthchecksPing(result: BackupResult): Promise<void> {
    if (!this.context.healthchecksUrl) {
      return
    }

    try {
      const allSuccess = result.successCount === result.totalCount
      // Healthchecks.io pattern: append /fail for failures
      const url = allSuccess ? this.context.healthchecksUrl : `${this.context.healthchecksUrl}/fail`

      const response = await fetch(url, {
        method: "POST",
        body: this.buildHealthchecksMessage(result),
      })

      if (response.ok) {
        log(`healthchecks ping sent successfully (${allSuccess ? "success" : "fail"})`)
      } else {
        error(`healthchecks ping failed: ${response.status} ${response.statusText}`)
      }
    } catch (err) {
      error(`Failed to send healthchecks ping: ${err}`)
    }
  }

  /**
   * Builds a summary message for healthchecks ping body
   */
  private buildHealthchecksMessage(result: BackupResult): string {
    const { successCount, totalCount, totalSizeGB, durationMs } = result
    const durationMinutes = Math.floor(durationMs / 60000)
    const durationSeconds = Math.floor((durationMs % 60000) / 1000)

    let message = `Server: ${this.context.serverName}\n`
    message += `Success: ${successCount}/${totalCount}\n`
    message += `Size: ${totalSizeGB.toFixed(2)} GB\n`
    message += `Duration: ${durationMinutes}m ${durationSeconds}s\n`

    const failedBackups = result.backups.filter((b) => b.status === BackupStatus.ERROR)
    if (failedBackups.length > 0) {
      message += "\nFailed:\n"
      for (const backup of failedBackups) {
        message += `- ${backup.name}: ${backup.error || "unknown error"}\n`
      }
    }

    return message
  }

  /**
   * Sends notification via ntfy
   */
  private async sendNtfyNotification(result: BackupResult): Promise<boolean> {
    try {
      const { successCount, totalCount } = result
      const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(0) : "0"

      // Headers must be ASCII-only (no emojis)
      const title =
        `Backup report, server "${this.context.serverName}": ${successCount}/${totalCount} (${successRate}%)`
      const message = this.buildNtfyMessage(result)

      const headers: Record<string, string> = {
        "Title": title,
        "Priority": successCount === totalCount ? "default" : "high",
        "Tags": successCount === totalCount ? "white_check_mark" : "warning",
      }

      if (this.context.ntfyAuth) {
        headers["Authorization"] = `Bearer ${this.context.ntfyAuth}`
      }

      const response = await fetch(this.context.ntfyUrl, {
        method: "POST",
        headers,
        body: message,
      })

      log(`ntfy response status: ${response.status}`)
      const responseBody = await response.text()
      log(`ntfy response body: ${responseBody}`)

      return response.ok
    } catch (err) {
      error(`Failed to send ntfy notification: ${err}`)
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
    let message = `💾 Total: ${totalSizeGB.toFixed(2)} GB\n⏱️ Duration: ${durationText}\n\n`

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

    log(`--------- Backups finished: ${successCount} / ${totalCount} successful ---------`)
    log(`Duration: ${durationMinutes}m ${durationSeconds}s`)

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
      log(`Total backup size: ${totalSizeGB.toFixed(2)} GB`)
      if (sizeErrors > 0) {
        log(`Size calculation errors: ${sizeErrors} repositories`)
      }
    } else if (sizeErrors > 0) {
      log(`Size calculation failed for all ${sizeErrors} repositories`)
    }
  }

  /**
   * Prints a formatted table of backup results
   */
  private printBackupTable(backups: BackupConfigState[], totalSizeGB: number): void {
    // Sort backups by percentage descending
    const sortedBackups = this.sortBackupsBySize(backups, totalSizeGB)

    log("Status | Name                 | %     | Size      | Time")
    log("-------|----------------------|-------|-----------|-------")

    for (const backup of sortedBackups) {
      const statusEmoji = backup.status === BackupStatus.SUCCESS ? "✅" : "❌"
      const name = backup.name.padEnd(20, " ").substring(0, 20)
      const { percentage, size } = this.formatBackupSize(backup, totalSizeGB)
      const duration = this.formatDuration(backup.durationMs)

      log(`${statusEmoji}     | ${name} | ${percentage} | ${size.padEnd(9)} | ${duration}`)
    }
  }

  /**
   * Builds the header text for the notification
   */
  private buildHeaderText(
    successCount: number,
    totalCount: number,
    totalSizeGB: number,
    backups: BackupConfigState[],
    durationMs: number,
  ): string {
    const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(0) : "0"
    const durationMinutes = Math.floor(durationMs / 60000)
    const durationSeconds = Math.floor((durationMs % 60000) / 1000)
    const durationText = durationMinutes > 0
      ? `${durationMinutes}m ${durationSeconds}s`
      : `${durationSeconds}s`

    let headerText =
      `🏠 Homelab Backup Report\n${successCount}/${totalCount} successful (${successRate}%)\n⏱️ Duration: ${durationText}`

    const sizeErrors = backups.filter((b) => b.sizeError).length

    if (totalSizeGB > 0) {
      headerText += `\n💾 Total: ${totalSizeGB.toFixed(2)} GB`
      if (sizeErrors > 0) {
        headerText += ` (${sizeErrors} size errors)`
      }
    } else if (sizeErrors > 0) {
      headerText += `\n⚠️ Size calculation failed for all repositories`
    }

    return headerText
  }

  /**
   * Builds the table content for the notification
   */
  private buildTableContent(backups: BackupConfigState[], totalSizeGB: number): string {
    const sortedBackups = this.sortBackupsBySize(backups, totalSizeGB)

    let tableContent = "```\n"
    tableContent += "Status | Name                 | %     | Size      | Time\n"
    tableContent += "-------|----------------------|-------|-----------|-------\n"

    for (const backup of sortedBackups) {
      const statusEmoji = backup.status === BackupStatus.SUCCESS ? "✅" : "❌"
      const name = backup.name.padEnd(20, " ").substring(0, 20)
      const { percentage, size } = this.formatBackupSize(backup, totalSizeGB)
      const duration = this.formatDuration(backup.durationMs)

      tableContent += `${statusEmoji}     | ${name} | ${percentage} | ${
        size.padEnd(9)
      } | ${duration}\n`
    }

    tableContent += "```"
    return tableContent
  }

  /**
   * Builds error details section for failed backups
   */
  private buildErrorDetails(backups: BackupConfigState[]): string {
    const failedBackups = backups.filter((backup) => backup.status === BackupStatus.ERROR)

    if (failedBackups.length === 0) {
      return ""
    }

    let errorDetails = "\n*Error Details:*\n"
    for (const backup of failedBackups) {
      if (backup.error) {
        errorDetails +=
          `• *${backup.name}*: [${backup.errorAtStep?.toUpperCase()}] ${backup.error}\n`
      }
    }

    return errorDetails
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
