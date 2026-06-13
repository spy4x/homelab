import { BackupConfig, SERVER_NAME } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "mirotalk",
  destName: `mirotalk-${SERVER_NAME}`,
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}

export default backupConfig
