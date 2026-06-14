import { BackupConfig, VOLUMES_PATH } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "usememos",
  sourcePaths: [`${VOLUMES_PATH}/memos`],
  containers: {
    stop: "default",
  },
}

export default backupConfig
