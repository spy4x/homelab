import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "immich",
  sourcePaths: [
    `${PATH_VOLUMES}/immich`,
    `${PATH_MEDIA}/photos`,
  ],
  pathsToChangeOwnership: [`${PATH_VOLUMES}/immich`],
  containers: {
    stop: ["immich-server", "immich-machine-learning", "immich-db", "immich-kv"],
  },
}

export default backupConfig
