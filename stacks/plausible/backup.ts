import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "plausible",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
