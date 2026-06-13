import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "usememos",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
