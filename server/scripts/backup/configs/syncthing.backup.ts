import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "syncthing",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
