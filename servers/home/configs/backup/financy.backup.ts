import { BackupConfig } from "@scripts/backup/src/+lib.ts"

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
