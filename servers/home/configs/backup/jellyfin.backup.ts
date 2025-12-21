import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "jellyfin",
  sourcePaths: [
    `${VOLUMES_PATH}/jellyfin/config`,
    `${VOLUMES_PATH}/jellyfin/data`,
    `${VOLUMES_PATH}/jellyfin/plugins`,
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
