import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "ntfy",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
