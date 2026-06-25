import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "authelia",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
