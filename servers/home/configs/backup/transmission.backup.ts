import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "transmission",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
