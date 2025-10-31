import { BackupConfig, PATH_APPS } from "../src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "proxy",
  sourcePaths: [`${PATH_APPS}/.volumes/traefik`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
