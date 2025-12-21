import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "open-webui",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
