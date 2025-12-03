import { BackupConfig } from "@scripts/backup/+lib.ts"

const backupConfig: BackupConfig = {
  name: "home-assistant",
  sourcePaths: "default",
  pathsToChangeOwnership: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
