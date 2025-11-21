import { BackupConfig } from "../../../../../server/scripts/backup/+lib.ts";

const backupConfig: BackupConfig = {
  name: "uptime-kuma",
  sourcePaths: [
    "./.volumes/uptime-kuma",
  ],
  containers: "default",
};

export default backupConfig;
