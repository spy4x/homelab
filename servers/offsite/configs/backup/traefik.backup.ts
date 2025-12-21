import { BackupConfig, VOLUMES_PATH, SERVER_NAME } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "traefik",
  destName: `traefik-${SERVER_NAME}`, // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [`${VOLUMES_PATH}/traefik`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
