import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "upwork-triage",
  sourcePaths: ["${VOLUMES_PATH}/upwork-triage/data/jobs.json"],
  containers: {
    stop: ["upwork-triage"],
  },
}

export default backupConfig
