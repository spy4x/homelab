# Offsite Server - Backup Replication

Raspberry Pi for offsite backup replication and redundancy.

## Services

- **Syncthing**: Replicates backups from home and cloud servers
- **WireGuard**: VPN access
- **Traefik**: Reverse proxy
- **Watchtower**: Automatic container updates

## Quick Setup

See main [README.md](../../README.md) for setup and deployment instructions.

## Purpose

This server acts as an offsite backup location, providing:

- Geographic redundancy for backups
- Protection against site-specific disasters
- Additional monitoring node for cross-checking home/cloud servers

## Configuration

### Syncthing

Configure Syncthing to:

1. Connect to home server Syncthing instance
2. Connect to cloud server Syncthing instance
3. Accept shared folders containing backup repositories
4. Store backups in local storage

Access UI: https://sync-offsite.yourdomain.com or http://<offsite-ip>:8384

### Storage

Ensure sufficient storage for backup replication:

- Connect external HDD/SSD if needed
- Mount at startup via `/etc/fstab`
- Update `OFFSITE_PATH_SYNC` in `.env` to point to mount

### WireGuard

VPN peers configured in `.volumes/wireguard/`. Use for secure remote access to
offsite location.

## Monitoring

Should be monitored by home and cloud servers via Gatus/Uptime Kuma.

Configure ntfy notifications:

```env
OFFSITE_NTFY_AUTH_TOKEN=tk_<your-token>
```

## Raspberry Pi Fixes

### Read-only Boot Partition

If apt/dnf fails with read-only filesystem errors:

```bash
# Automated fix
ansible-playbook ansible/playbooks/fix-raspberry-pi.yml -K --limit offsite

# Manual fix
sudo mount -o remount,rw /boot/firmware
sudo dpkg --configure -a
```

### Performance

Raspberry Pi 4/5 recommended for better performance. Ensure:

- Active cooling (fan/heatsink)
- Quality power supply (official or equivalent)
- Fast SD card or boot from SSD

## Common Tasks

```bash
# Check services
docker compose ps

# View Syncthing status
docker logs syncthing

# Check disk space
df -h

# Check backup sync progress
du -sh <sync-path>/*
```

## Security

- SSH hardened via Ansible (key-only, custom port, fail2ban)
- Minimal services exposed externally
- VPN required for access to most services
- Regular security updates via Ansible maintenance playbook

## Notes

- Raspberry Pi OS (Debian-based) or Ubuntu Server recommended
- Keep firmware/packages updated:
  `ansible-playbook ansible/playbooks/maintenance.yml -K --limit offsite`
- Monitor temperature in hot environments (adjust thresholds in `.env`)
- Consider UPS for power redundancy in critical setups
