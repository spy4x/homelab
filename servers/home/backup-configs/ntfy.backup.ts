import { BackupConfig } from "@scripts/backup/+lib.ts"

const backupConfig: BackupConfig = {
  name: "ntfy-home", // Suffix added because ntfy is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
