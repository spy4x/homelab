import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "reitti",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
