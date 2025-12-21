import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "transmission",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
