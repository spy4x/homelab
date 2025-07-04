import { logError, logInfo } from "./+lib.ts"
import { BackupConfigState, BackupResult, BackupStatus } from "./types.ts"

export class BackupReporter {
  private webhookUrl: string

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  /**
   * Sends a comprehensive backup report via Slack webhook
   */
  async sendNotification(result: BackupResult): Promise<void> {
    try {
      const message = this.buildSlackMessage(result)

      const response = await fetch(this.webhookUrl, {
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
    const { backups, successCount, totalCount, totalSizeGB } = result

    logInfo(`--------- Backups finished: ${successCount} / ${totalCount} successful ---------`)

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

    logInfo("Status | Name                 | %     | Size")
    logInfo("-------|----------------------|-------|----------")

    for (const backup of sortedBackups) {
      const statusEmoji = backup.status === BackupStatus.SUCCESS ? "✅" : "❌"
      const name = backup.name.padEnd(20, " ").substring(0, 20)
      const { percentage, size } = this.formatBackupSize(backup, totalSizeGB)

      logInfo(`${statusEmoji}     | ${name} | ${percentage} | ${size}`)
    }
  }

  /**
   * Builds the complete Slack message with blocks
   */
  private buildSlackMessage(result: BackupResult): object {
    const { backups, successCount, totalCount, totalSizeGB } = result

    const headerText = this.buildHeaderText(successCount, totalCount, totalSizeGB, backups)
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
  ): string {
    const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(0) : "0"
    let headerText =
      `🏠 Homelab Backup Report\n${successCount}/${totalCount} successful (${successRate}%)`

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
    tableContent += "Status | Name                 | %     | Size\n"
    tableContent += "-------|----------------------|-------|----------\n"

    for (const backup of sortedBackups) {
      const statusEmoji = backup.status === BackupStatus.SUCCESS ? "✅" : "❌"
      const name = backup.name.padEnd(20, " ").substring(0, 20)
      const { percentage, size } = this.formatBackupSize(backup, totalSizeGB)

      tableContent += `${statusEmoji}     | ${name} | ${percentage} | ${size}\n`
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
}
