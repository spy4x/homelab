import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "audiobookshelf",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
