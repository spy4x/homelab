import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "umami",
  sourcePaths: [`${VOLUMES_PATH}/umami`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
