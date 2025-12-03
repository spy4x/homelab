import { BackupConfig } from "@scripts/backup/+lib.ts"
const backupConfig: BackupConfig = {
  name: "radicale",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
