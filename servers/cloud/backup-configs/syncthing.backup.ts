import type { BackupConfig } from "@scripts/backup/+lib.ts"

export const config: BackupConfig = {
  name: "syncthing-cloud", // Suffix added because syncthing is shared across servers
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}
