import { BackupConfig, PATH_VOLUMES, SERVER_NAME } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "traefik",
  destName: `traefik-${SERVER_NAME}`, // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [`${PATH_VOLUMES}/traefik`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
