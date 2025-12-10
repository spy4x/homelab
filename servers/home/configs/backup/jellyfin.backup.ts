import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "jellyfin",
  sourcePaths: [
    `${PATH_VOLUMES}/jellyfin/config`,
    `${PATH_VOLUMES}/jellyfin/data`,
    `${PATH_VOLUMES}/jellyfin/plugins`,
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
