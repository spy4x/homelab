import { BackupConfig } from "../scripts/backup/src/+lib.ts"

/**
 * Gatus Backup Configuration
 *
 * Backs up:
 * - config.yaml: Health check and alerting configuration
 * - data/: SQLite database with check history and results
 */
const backupConfig: BackupConfig = {
  name: "gatus",
  destName: "gatus-cloud", // Suffix added because gatus is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
