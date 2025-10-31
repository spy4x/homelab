import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "adguard",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
