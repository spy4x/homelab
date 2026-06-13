import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "stirling-pdf",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
