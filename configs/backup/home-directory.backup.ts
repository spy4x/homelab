import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "home-directory",
  sourcePaths: ["/home"],
  pathsToChangeOwnership: ["/home"],
}

export default backupConfig