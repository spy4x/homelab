import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "piped",
  sourcePaths: "default", // Backs up ${PATH_APPS}/.volumes/piped (contains postgres data)
  containers: {
    stop: ["piped-backend", "piped-db"],
  },
}

export default backupConfig
