import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "searxng",
  sourcePaths: [`${VOLUMES_PATH}/searxng`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
