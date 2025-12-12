import { BackupConfig, SERVER_NAME } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "gatus",
  destName: `gatus-${SERVER_NAME}`, // Suffix added because gatus is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
