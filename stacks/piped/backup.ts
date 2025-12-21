import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "piped",
  sourcePaths: "default",
  containers: {
    stop: ["piped-backend", "piped-db"],
  },
}

export default backupConfig
