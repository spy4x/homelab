import type { BackupConfig } from "../src/types.ts";

/**
 * Syncthing - File synchronization
 * Backs up:
 * - Configuration (config.xml, cert.pem, key.pem)
 * - Database (index-v0.14.0.db)
 * - HTTPS certificates
 */
export const config: BackupConfig = {
  ...("default" as const),
  paths: [
    "/var/syncthing/config",
  ],
};
