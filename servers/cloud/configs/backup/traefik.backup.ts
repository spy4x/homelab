import { BackupConfig, SERVER_NAME, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "traefik",
  destName: `traefik-${SERVER_NAME}`, // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [
    `${VOLUMES_PATH}/traefik/letsencrypt`, // SSL certificates
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
