import { BackupConfig, SERVER_NAME } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "syncthing",
  destName: `syncthing-${SERVER_NAME}`, // Suffix added because syncthing is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
