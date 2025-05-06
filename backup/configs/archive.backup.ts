import { BackupConfig, PATH_SYNC } from "../+lib.ts"

const backupConfig: BackupConfig = {
  name: "archive",
  sourcePaths: [
    `${PATH_SYNC}/archive`,
  ],
}

export default backupConfig
