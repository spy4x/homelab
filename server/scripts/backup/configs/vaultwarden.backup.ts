import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "vaultwarden",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
