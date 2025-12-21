import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "adguard",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
