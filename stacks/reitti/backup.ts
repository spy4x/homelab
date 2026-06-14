import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "reitti",
  sourcePaths: [
    "/var/lib/docker/volumes/reitti_reitti-data/_data",
    "/var/lib/docker/volumes/reitti_postgis-data/_data",
    "/var/lib/docker/volumes/reitti_redis-data/_data",
    "/var/lib/docker/volumes/reitti_tile-cache-data/_data",
  ],
  containers: {
    stop: ["hl-reitti", "reitti-postgis-1", "reitti-redis-1", "reitti-tile-cache-1"],
  },
}

export default backupConfig
