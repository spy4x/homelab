import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "mail-ai",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
