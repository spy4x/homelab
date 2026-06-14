import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "authentik",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
