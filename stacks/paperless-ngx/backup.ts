import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "paperless-ngx",
  sourcePaths: [
    `${VOLUMES_PATH}/paperless-ngx`,
  ],
  containers: {
    stop: ["hl-paperless", "hl-paperless-worker", "hl-paperless-db", "hl-paperless-redis"],
  },
}

export default backupConfig
