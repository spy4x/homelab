import { BackupConfig, PATH_APPS, PATH_MEDIA } from "../+lib.ts"

const backupConfig: BackupConfig = {
  name: "immich",
  sourcePaths: [
    `${PATH_APPS}/.volumes/immich`,
    `${PATH_MEDIA}/photos`,
  ],
  pathsToChangeOwnership: [`${PATH_APPS}/.volumes/immich`],
  containers: {
    stop: ["immich_server", "immich_machine_learning", "immich_postgres", "immich_redis"],
  },
}

export default backupConfig
