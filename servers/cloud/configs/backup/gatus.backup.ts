import { BackupConfig, SERVER_NAME } from "@scripts/backup"

/**
 * Gatus Backup Configuration
 *
 * Backs up:
 * - config.yaml: Health check and alerting configuration
 * - data/: SQLite database with check history and results
 */
const backupConfig: BackupConfig = {
  name: "gatus",
  destName: `gatus-${SERVER_NAME}`, // Suffix added because gatus is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
