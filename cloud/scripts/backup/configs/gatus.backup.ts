import type { BackupServiceConfig } from "../src/types.ts";

/**
 * Gatus Backup Configuration
 * 
 * Backs up:
 * - config.yaml: Health check and alerting configuration
 * - data/: SQLite database with check history and results
 */
export const gatusBackup: BackupServiceConfig = {
  name: "gatus",
  containers: ["gatus"],
  paths: {
    "/app/data/config.yaml": "config.yaml",
    "/app/data": "data/",
  },
};
