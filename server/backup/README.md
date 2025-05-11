# Homelab Backup System

This directory contains the backup automation for your homelab services using `Deno` script and `restic`.

## How It Works

- **Configuration:** Each backup job is defined in a TypeScript file in `backup/configs/` (see examples in that folder).
- **Main Script:** The main entrypoint is `backup/+main.ts`. It:
  - Loads all configs from `backup/configs/*.backup.ts`
  - Optionally stops containers before backup (if configured)
  - Changes ownership of files if needed (may require root or allow user to chown without sudo. TODO: To be improved, not the best practice)
  - Runs restic to back up the specified paths
  - Prunes old backups according to retention policy
  - Restarts containers after backup
  - Notifies via Slack on completion (if configured)

## Requirements

- Deno (https://deno.com/)
- restic (https://restic.net/)
- Docker (if using container stop/start)
- A `.env` file with at least:
  - `BACKUPS_PASSWORD` (restic repo password)
  - `SLACK_WEBHOOK_URL` (optional, for notifications)

## Usage

### 1. Manual Run

From the project root:

```zsh
# Run with all permissions and env file
/absolute/path/to/deno run --env-file=/path/to/homelab/.env -A /path/to/homelab/backup/+main.ts
```

To configure chown to be used without sudo, you can allow chown command to be run without password for the user running the script. Edit the sudoers file with:

```zsh
sudo visudo
```

And add the following line (replace `username` with your actual username):

```zsh
username ALL=(ALL) NOPASSWD: /usr/bin/chown
```

This allows the user to run the `chown` command without needing to enter a password, which is necessary for the script to change ownership of files before backup.
Make sure to test the command to ensure it works as expected.
This is a security risk, so be cautious and ensure you understand the implications.

### 2. Add to Cron

To automate backups, add a cron job. Example (daily at 2:30am):

```zsh
30 2 * * * USER=username /absolute/path/to/deno run --env-file=/path/to/homelab/.env -A /path/to/homelab/backup/+main.ts >> /path/to/homelab/backup.log 2>&1
```

### 3. How to Restore

To restore files from a restic backup:

```zsh
# List snapshots
restic -r /path/to/repo snapshots

# Restore a snapshot (replace <ID> and <target-dir>)
restic -r /path/to/repo restore <snapshot-id> --target <target-dir>
```

You will need to provide the `BACKUPS_PASSWORD` as an environment variable or via prompt.
Losing the password will make it impossible to restore backups.

## Adding/Editing Backups

- Add a new config file to `backup/configs/` (see existing `.backup.ts` files for examples).
- Use `sourcePaths: "default"` or specify an array of paths.
- Optionally set `pathsToChangeOwnership` and `containers`.

## Notes

- The script will stop/start containers if configured.
- Ownership of files can be changed before backup (requires sudo/root/allow chown without sudo).
- Retention policy is set in the script (see `forget` step).
- Notifications are sent to Slack if `SLACK_WEBHOOK_URL` is set.

## Troubleshooting

- Check `backup.log` for errors.
- Ensure all required environment variables are set.
- Make sure restic and Deno are installed and available in the PATH for cron/root.
