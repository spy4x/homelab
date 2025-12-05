import { BackupConfig, PATH_APPS } from "@scripts/backup/+lib.ts"

const backupConfig: BackupConfig = {
  name: "traefik-home", // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [`${PATH_APPS}/.volumes/traefik`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
