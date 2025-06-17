import { BackupConfig } from "../+lib.ts"

const backupConfig: BackupConfig = {
  name: "audiobookshelf",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
