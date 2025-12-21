import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "mailserver",
  sourcePaths: [
    `${VOLUMES_PATH}/mailserver/mail-data`, // All emails
    `${VOLUMES_PATH}/mailserver/mail-state`, // Rspamd, fail2ban state
    `${VOLUMES_PATH}/mailserver/config`, // User accounts, aliases, DKIM keys
  ],
  containers: {
    stop: "default",
  },
}

export default backupConfig
