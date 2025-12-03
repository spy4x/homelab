# Homelab Backup System

A modular TypeScript backup system using Deno and Restic for backing up homelab services.

## Architecture

The backup system is organized into clean, modular components:

### Core Files

- **`+main.ts`** - Main script containing backup orchestration logic
- **`+lib.ts`** - Shared utilities and environment variable helpers

### Source Modules (`src/`)

- **`types.ts`** - TypeScript types and interfaces
- **`config.ts`** - Configuration loading and validation logic
- **`operations.ts`** - Core backup operations (Docker, Restic, file management)
- **`reporting.ts`** - Notification and reporting functionality

### Configuration Files

- **`configs/*.backup.ts`** - Individual service backup configurations

## Features

- **Modular Design**: Each concern is separated into its own module
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Robust error handling with detailed reporting
- **Docker Integration**: Automatic container stop/start during backups
- **Ownership Management**: Handles file ownership for proper backup access
- **Repository Management**: Automatic Restic repository initialization
- **Size Reporting**: Calculates and reports backup repository sizes
- **Slack Notifications**: Comprehensive backup reports via Slack webhook
- **Configurable Retention**: Configurable backup retention policies

## Usage

### Manual Run

```bash
# Run the backup process
deno run -A +main.ts

# With environment file
deno run --env-file=/path/to/.env -A +main.ts

# Check TypeScript compilation
deno check +main.ts
```

### Cron Job

It has to be installed for root via `sudo crontab -e` to allow changing ownership without password prompts.

```bash
# Daily at 2:30am
30 2 * * * USER=username /path/to/deno run --env-file=/path/to/.env -A /path/to/+main.ts >> /path/to/backup.log 2>&1
# Example
30 2 * * * USER=spy4x /home/spy4x/.deno/bin/deno run --env-file=/home/spy4x/ssd-2tb/apps/.env -A /home/spy4x/ssd-2tb/apps/scripts/backup/+main.ts >> /home/spy4x/backup.log 2>&1
```

## Environment Variables

Required environment variables:

- `PATH_SYNC` - Base path for backup storage
- `BACKUPS_PASSWORD` - Password for restic repositories
- `SLACK_WEBHOOK_URL` - Slack webhook URL for notifications (fallback)
- `PATH_APPS` - Path to applications directory
- `USER` - Current user name for ownership changes

Optional environment variables:

- `NTFY_URL` - ntfy topic URL for notifications (e.g., `https://ntfy.yourdomain.com/backups`)
- `NTFY_AUTH_TOKEN` - ntfy authentication token (Bearer token from ntfy settings)

## Configuration Structure

Each backup configuration file should export a default `BackupConfig` object:

```typescript
import { BackupConfig, PATH_APPS } from "../+lib.ts"

const backupConfig: BackupConfig = {
  name: "service-name",
  sourcePaths: [`${PATH_APPS}/.volumes/service-name`],
  pathsToChangeOwnership: [`${PATH_APPS}/.volumes/service-name`],
  containers: {
    stop: ["container1", "container2"],
  },
}

export default backupConfig
```

### Configuration Options

- `name` - Backup name (used for repository naming)
- `sourcePaths` - Paths to backup (use "default" for `${PATH_APPS}/.volumes/${name}`)
- `pathsToChangeOwnership` - Paths to change ownership before backup (optional)
- `containers.stop` - Docker containers to stop during backup (use "default" for `[name]`)

## Backup Process

1. **Load Configurations** - Dynamically import all `*.backup.ts` files
2. **Validate Configurations** - Check paths exist and normalize settings
3. **For Each Backup**:
   - Stop Docker containers
   - Change file ownership if configured
   - Initialize Restic repository if needed
   - Perform backup with integrity checks
   - Clean up old backups (7 daily, 4 weekly, 3 monthly)
   - Restart Docker containers
4. **Calculate Repository Sizes** - Get disk usage for each repository
5. **Generate Reports** - Console output and Slack notification

## Error Handling

The system provides comprehensive error handling:

- Configuration validation errors
- Path existence checks
- Docker command failures
- Restic operation failures with specific exit code handling
- Size calculation errors
- Notification failures

All errors are logged with context and reported in the final notification.

## Restore Process

To restore files from a restic backup:

```bash
# Set password environment variable
export RESTIC_PASSWORD="your-backup-password"

# List snapshots
restic -r /path/to/repo snapshots

# Restore a snapshot
restic -r /path/to/repo restore <snapshot-id> --target <target-dir>

# Restore specific files
restic -r /path/to/repo restore <snapshot-id> --target <target-dir> --include "path/to/specific/file"
```

## Security Notes

For the chown operations to work without sudo prompts, configure sudoers:

```bash
sudo visudo
```

Add line (replace `username` with your actual username):

```
username ALL=(ALL) NOPASSWD: /usr/bin/chown
```

**Warning**: This is a security consideration. Ensure you understand the implications.

## Refactoring Benefits

The refactored architecture provides:

- **Simplified Structure**: Main logic consolidated in `+main.ts` with support modules in `src/`
- **Better Separation of Concerns**: Each module in `src/` has a single responsibility
- **Improved Maintainability**: Easier to modify specific functionality
- **Enhanced Testability**: Functions are focused and easier to unit test
- **Type Safety**: Comprehensive TypeScript typing throughout
- **Better Error Handling**: More granular error handling and reporting
- **Code Reusability**: Modular design allows for better code reuse
- **Cleaner Organization**: Logical file structure without redundant prefixes
- **Easier Debugging**: Clear module boundaries make issues easier to trace

## Troubleshooting

- Check logs for specific error messages
- Ensure all required environment variables are set
- Verify Deno and restic are installed and accessible
- Check file permissions for backup paths
- Validate Docker container names match actual running containers
