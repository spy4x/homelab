import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "open-webui",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
