import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "akaunting",
  sourcePaths: [`${VOLUMES_PATH}/akaunting`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
