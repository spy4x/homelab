import { BackupConfig } from "../../../../../server/scripts/backup/+lib.ts";

const backupConfig: BackupConfig = {
  name: "ntfy",
  sourcePaths: [
    "./.volumes/ntfy",
  ],
  containers: "default",
};

export default backupConfig;
