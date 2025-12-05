import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "gatus",
  destName: "gatus-home", // Suffix added because gatus is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
