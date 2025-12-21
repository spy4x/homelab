import { BackupConfig, VOLUMES_PATH, PATH_MEDIA } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "immich",
  sourcePaths: [
    `${VOLUMES_PATH}/immich`,
    `${PATH_MEDIA}/photos`,
  ],
  pathsToChangeOwnership: [`${VOLUMES_PATH}/immich`],
  containers: {
    stop: ["immich-server", "immich-machine-learning", "immich-db", "immich-kv"],
  },
}

export default backupConfig
