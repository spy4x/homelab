import { BackupConfig } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "uptime-kuma",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
