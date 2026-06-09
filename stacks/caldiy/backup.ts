import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "caldiy",
  sourcePaths: [
    `${VOLUMES_PATH}/caldiy/db`,
    `${VOLUMES_PATH}/caldiy/redis`,
  ],
  containers: {
    stop: ["caldiy", "caldiy-db", "caldiy-redis"],
  },
}

export default backupConfig
