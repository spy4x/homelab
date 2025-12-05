import { BackupConfig } from "@scripts/backup/+lib.ts"

const backupConfig: BackupConfig = {
  name: "traefik-cloud", // Suffix added because traefik/proxy is shared across servers
  sourcePaths: [
    "./.volumes/traefik/letsencrypt", // SSL certificates
  ],
  containers: "default",
}

export default backupConfig
