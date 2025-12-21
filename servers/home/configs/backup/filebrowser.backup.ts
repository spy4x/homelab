import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "filebrowser",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
