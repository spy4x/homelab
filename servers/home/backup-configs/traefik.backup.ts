import { BackupConfig, PATH_APPS } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "traefik",
  destName: "traefik-home", // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [`${PATH_APPS}/.volumes/traefik`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
