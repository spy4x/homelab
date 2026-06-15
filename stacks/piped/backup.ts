import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "piped",
  sourcePaths: "default",
  containers: {
    stop: ["hl-piped-backend", "hl-piped-db"],
  },
}

export default backupConfig
