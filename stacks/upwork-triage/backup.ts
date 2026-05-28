import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "upwork-triage",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
