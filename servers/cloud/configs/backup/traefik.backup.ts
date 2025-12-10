import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "traefik",
  destName: `traefik-${SERVER_NAME}`, // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [
    "${VOLUMES_PATH}/traefik/letsencrypt", // SSL certificates
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
