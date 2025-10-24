import { BackupConfig, PATH_APPS } from "../src/+lib.ts"

const POSTGRES_VOLUME_PATH = `${PATH_APPS}/.volumes/vikunja/db`

const backupConfig: BackupConfig = {
  name: "vikunja",
  sourcePaths: [POSTGRES_VOLUME_PATH],
  pathsToChangeOwnership: [POSTGRES_VOLUME_PATH],
  containers: {
    stop: ["vikunja", "vikunja-db"],
  },
}

export default backupConfig
