import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "filebrowser",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
