import { BackupConfig } from "@scripts/backup/+lib.ts"

const backupConfig: BackupConfig = {
  name: "traefik",
  destName: "traefik-cloud", // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [
    "./.volumes/traefik/letsencrypt", // SSL certificates
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
