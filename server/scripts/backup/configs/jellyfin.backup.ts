import { BackupConfig, PATH_APPS } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "jellyfin",
  sourcePaths: [
    `${PATH_APPS}/.volumes/jellyfin/config`,
    `${PATH_APPS}/.volumes/jellyfin/data`,
    `${PATH_APPS}/.volumes/jellyfin/plugins`,
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
