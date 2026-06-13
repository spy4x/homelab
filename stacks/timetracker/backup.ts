import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "timetracker",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
