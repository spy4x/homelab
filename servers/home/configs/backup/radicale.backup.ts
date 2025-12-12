import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "radicale",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
