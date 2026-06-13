import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "traggo",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
