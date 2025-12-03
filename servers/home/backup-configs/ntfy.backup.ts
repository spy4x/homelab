import { BackupConfig } from "@scripts/backup/+lib.ts"

const backupConfig: BackupConfig = {
  name: "ntfy",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
