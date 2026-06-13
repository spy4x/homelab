import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "gitea",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
