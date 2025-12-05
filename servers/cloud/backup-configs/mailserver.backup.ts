import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "mailserver",
  sourcePaths: [
    "./.volumes/mailserver/mail-data", // All emails
    "./.volumes/mailserver/mail-state", // Rspamd, fail2ban state
    "./.volumes/mailserver/config", // User accounts, aliases, DKIM keys
  ],
  containers: "default",
}

export default backupConfig
