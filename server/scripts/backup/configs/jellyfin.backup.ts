import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "jellyfin",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
