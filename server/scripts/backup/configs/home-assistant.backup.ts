import { BackupConfig } from "../+lib.ts"

const backupConfig: BackupConfig = {
  name: "home-assistant",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
