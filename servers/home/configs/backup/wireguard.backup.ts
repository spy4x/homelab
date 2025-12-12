import { BackupConfig, SERVER_NAME } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "wireguard",
  destName: `wireguard-${SERVER_NAME}`, // Suffix added because wireguard is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
