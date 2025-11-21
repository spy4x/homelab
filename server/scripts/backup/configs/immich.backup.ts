import { BackupConfig, PATH_APPS, PATH_MEDIA } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "immich",
  sourcePaths: [
    `${PATH_APPS}/.volumes/immich`,
    `${PATH_MEDIA}/photos`,
  ],
  pathsToChangeOwnership: [`${PATH_APPS}/.volumes/immich`],
  containers: {
    stop: ["immich-server", "immich-machine-learning", "immich-db", "immich-kv"],
  },
}

export default backupConfig
