import { BackupConfig, PATH_SYNC } from "../+lib.ts"

const backupConfig: BackupConfig = {
  name: "essentials",
  sourcePaths: [
    `${PATH_SYNC}/essentials`,
  ],
}

export default backupConfig
