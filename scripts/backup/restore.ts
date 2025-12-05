// Restore script for recovering service data from backups
// Usage: deno run -A scripts/backup/restore.ts <service-name>
// Example: deno run -A scripts/backup/restore.ts gatus-home

import { error, log } from "../+lib.ts"

// Parse command line arguments
const args = Deno.args
if (args.length < 1) {
  error("Usage: deno run -A scripts/backup/restore.ts <service-name>")
  error("Example: deno run -A scripts/backup/restore.ts gatus-home")
  error("")
  error("Available services:")
  error("  - Check servers/*/backup-configs/ for service names")
  Deno.exit(1)
}

const serviceName = args[0]

log(`Starting restore for service: ${serviceName}`)

// TODO: Implement restore logic
// 1. Find backup config for service
// 2. List available snapshots from restic
// 3. Prompt user to select snapshot (or use latest)
// 4. Stop containers if needed
// 5. Restore files from backup
// 6. Fix permissions
// 7. Start containers
// 8. Verify restoration

error("Restore functionality not yet implemented")
error("Manual restore process:")
error("")
error("1. List snapshots:")
error(`   export RESTIC_PASSWORD='your-password'`)
error(`   restic -r ~/sync/backups/${serviceName} snapshots`)
error("")
error("2. Restore to temporary location:")
error(`   restic -r ~/sync/backups/${serviceName} restore latest --target /tmp/restore`)
error("")
error("3. Stop service:")
error(`   docker compose stop <container-name>`)
error("")
error("4. Copy restored files:")
error(`   cp -r /tmp/restore/* ./.volumes/<service>/`)
error("")
error("5. Fix permissions:")
error(`   chown -R <user>:<group> ./.volumes/<service>/`)
error("")
error("6. Start service:")
error(`   docker compose start <container-name>`)

Deno.exit(1)
