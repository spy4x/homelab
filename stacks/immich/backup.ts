import { BackupConfig, PATH_MEDIA, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "immich",
  sourcePaths: [
    `${VOLUMES_PATH}/immich`,
    `${PATH_MEDIA}/photos`,
  ],
  pathsToChangeOwnership: [`${VOLUMES_PATH}/immich`],
  containers: {
    stop: ["hl-immich-server", "hl-immich-machine-learning", "hl-immich-db", "hl-immich-kv"],
  },
}

export default backupConfig
