import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "stalwart",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
