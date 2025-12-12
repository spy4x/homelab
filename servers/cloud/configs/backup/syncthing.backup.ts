import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "syncthing",
  destName: "syncthing-cloud", // Suffix added because syncthing is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
