import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "roundcube",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
