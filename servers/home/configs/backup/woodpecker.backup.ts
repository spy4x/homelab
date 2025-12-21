import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "woodpecker-server",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
