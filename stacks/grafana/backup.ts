import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "grafana",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
