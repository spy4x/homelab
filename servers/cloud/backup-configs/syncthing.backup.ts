import type { BackupConfig } from "@scripts/backup/+lib.ts"

export const config: BackupConfig = {
  name: "syncthing",
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}
