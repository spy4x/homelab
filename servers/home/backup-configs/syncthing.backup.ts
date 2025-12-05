import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "syncthing",
  destName: "syncthing-home", // Suffix added because syncthing is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
