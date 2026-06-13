import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "it-tools",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
