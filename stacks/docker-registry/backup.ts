import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "docker-registry",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
