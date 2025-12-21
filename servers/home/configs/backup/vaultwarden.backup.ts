import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "vaultwarden",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
