import { BackupConfig } from "../../../../../server/scripts/backup/+lib.ts";

const backupConfig: BackupConfig = {
  name: "roundcube",
  sourcePaths: [
    "./.volumes/roundcube",
  ],
  containers: "default",
};

export default backupConfig;
