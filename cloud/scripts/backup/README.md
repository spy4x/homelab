# Cloud Backup Configurations

This directory contains backup configurations for all cloud services running on Hetzner VPS.

## Overview

The cloud server uses the same backup infrastructure as the home server (Deno + Restic). Backup configs define which data to backup for each service.

## Backup Configurations

### mailserver.backup.ts
Backs up all email data including:
- `mail-data/` - All user emails
- `mail-state/` - Rspamd learning data, fail2ban state
- `config/` - User accounts, aliases, DKIM keys

**Critical:** This is the most important backup - contains all email data.

### roundcube.backup.ts
Backs up webmail data:
- User preferences
- Address books
- SQLite database

### uptime-kuma.backup.ts
Backs up monitoring configuration:
- Monitors configuration
- Alert settings
- Status history

### ntfy.backup.ts
Backs up notification service data:
- User accounts
- Subscriptions
- Cached notifications

### traefik.backup.ts
Backs up SSL certificates:
- Let's Encrypt certificates
- Traefik configuration

## Running Backups

### Manual Backup
```bash
ssh root@<Hetzner-IP>
cd /opt/cloud
deno run --allow-all scripts/backup/+main.ts
```

### Automated Backups
Configured via Ansible:
```bash
ansible-playbook cloud/ansible/playbooks/backup-cronjob.yml
```

This sets up daily backups at 3:00 AM.

## Backup Locations

Backups are stored using Restic to:
- Local: `.volumes/backups/` (temporary)
- Remote: Configure in `.env` (BACKUPS_PASSWORD, etc.)

## Restore Process

### Restore Emails
```bash
# Stop mail server
docker compose stop mailserver

# Restore from backup
restic -r /path/to/backup restore latest --target /opt/cloud/.volumes/mailserver/

# Restart mail server
docker compose start mailserver
```

### Restore Other Services
```bash
# Stop service
docker compose stop <service-name>

# Restore data
restic -r /path/to/backup restore latest --target /opt/cloud/.volumes/<service>/

# Restart service
docker compose start <service-name>
```

## Notes

- Lint errors about unable to load module are expected in development
- The backup script references the home server's backup library
- On the actual server, symlinks resolve correctly
- Backups run as the `cloud` user
- Check logs: `/var/log/cloud-backup.log`
