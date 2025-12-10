import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "mailserver",
  sourcePaths: [
    "${VOLUMES_PATH}/mailserver/mail-data", // All emails
    "${VOLUMES_PATH}/mailserver/mail-state", // Rspamd, fail2ban state
    "${VOLUMES_PATH}/mailserver/config", // User accounts, aliases, DKIM keys
  ],
  containers: "default",
}

export default backupConfig
