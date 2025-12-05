import type { BackupServiceConfig } from "@scripts/backup/+lib.ts"

/**
 * Gatus Backup Configuration
 *
 * Backs up:
 * - config.yaml: Health check and alerting configuration
 * - data/: SQLite database with check history and results
 */
export const gatusBackup: BackupServiceConfig = {
  name: "gatus-cloud", // Suffix added because gatus is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}
