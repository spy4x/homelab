import { BackupConfig, PATH_APPS } from "@scripts/backup"

const POSTGRES_VOLUME_PATH = `${PATH_APPS}/../fn/.volumes/postgres`

const backupConfig: BackupConfig = {
  name: "financy",
  sourcePaths: [POSTGRES_VOLUME_PATH],
  pathsToChangeOwnership: [POSTGRES_VOLUME_PATH],
  containers: {
    stop: ["fn-web", "fn-api", "fn-db"],
  },
}

export default backupConfig
