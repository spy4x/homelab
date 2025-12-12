import { BackupConfig, PATH_SYNC } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "archive",
  sourcePaths: [
    `${PATH_SYNC}/archive`,
  ],
}

export default backupConfig
