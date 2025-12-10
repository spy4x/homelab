import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "archive",
  sourcePaths: [
    `${PATH_SYNC}/archive`,
  ],
}

export default backupConfig
