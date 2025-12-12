import { BackupConfig, SERVER_NAME } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "ntfy",
  destName: `ntfy-${SERVER_NAME}`, // Suffix added because ntfy is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
