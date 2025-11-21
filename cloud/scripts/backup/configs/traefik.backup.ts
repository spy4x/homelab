import { BackupConfig } from "../../../../../server/scripts/backup/+lib.ts";

const backupConfig: BackupConfig = {
  name: "traefik",
  sourcePaths: [
    "./.volumes/traefik/letsencrypt", // SSL certificates
  ],
  containers: "default",
};

export default backupConfig;
