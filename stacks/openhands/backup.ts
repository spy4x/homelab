import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "openhands",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
