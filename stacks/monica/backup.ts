import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "monica",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
