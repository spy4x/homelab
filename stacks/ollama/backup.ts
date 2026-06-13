import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "ollama",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
