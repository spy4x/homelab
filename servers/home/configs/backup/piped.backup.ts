import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "piped",
  sourcePaths: "default",
  containers: {
    stop: ["piped-backend", "piped-db"],
  },
}

export default backupConfig
