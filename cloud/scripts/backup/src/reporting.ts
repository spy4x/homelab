import { logError, logInfo } from "./+lib.ts"
import { BackupConfigState, BackupResult, BackupStatus } from "./types.ts"

export class BackupReporter {
  private slackWebhookUrl?: string
  private ntfyUrl?: string
  private ntfyAuth?: string

  constructor(slackWebhookUrl?: string, ntfyUrl?: string, ntfyAuth?: string) {
    this.slackWebhookUrl = slackWebhookUrl
    this.ntfyUrl = ntfyUrl
    this.ntfyAuth = ntfyAuth
  }

  /**
   * Sends a comprehensive backup report via ntfy (primary) or Slack (fallback)
   */
  async sendNotification(result: BackupResult): Promise<void> {
    // Try ntfy first if configured
    if (this.ntfyUrl) {
      const ntfySuccess = await this.sendNtfyNotification(result)
      if (ntfySuccess) {
        logInfo("ntfy notification sent successfully")
        return
      }
      logError("ntfy notification failed, falling back to Slack")
    }

    // Fall back to Slack
    await this.sendSlackNotification(result)
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
   * Sends notification via Slack webhook
   */
  private async sendSlackNotification(result: BackupResult): Promise<void> {
    if (!this.slackWebhookUrl) {
      logError("Slack webhook URL not configured")
      return
    }
    try {
      const message = this.buildSlackMessage(result)

      const response = await fetch(this.slackWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      })

      if (!response.ok) {
        logError(`Error sending Slack message: ${response.statusText}`)
      } else {
        logInfo("Slack message sent")
      }
    } catch (err) {
      logError(`Failed to send Slack notification: ${err}`)
    }
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
   * Builds the complete Slack message with blocks
   */
  private buildSlackMessage(result: BackupResult): object {
    const { backups, successCount, totalCount, totalSizeGB, durationMs } = result

    const headerText = this.buildHeaderText(
      successCount,
      totalCount,
      totalSizeGB,
      backups,
      durationMs,
    )
    const tableContent = this.buildTableContent(backups, totalSizeGB)
    const errorDetails = this.buildErrorDetails(backups)

    return {
      text: `Backup finished: ${successCount}/${totalCount} successful`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: headerText,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: tableContent + errorDetails,
          },
        },
      ],
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
