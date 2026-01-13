import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "code-server",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
