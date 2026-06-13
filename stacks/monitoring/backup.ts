import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "monitoring",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
