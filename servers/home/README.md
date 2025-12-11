# Home Server - Primary Services

Fedora server running media, automation, and productivity services.

## Services

**Media**: Jellyfin, Immich, AudioBookshelf, MeTube, Transmission\
**Productivity**: Vaultwarden, FreshRSS, FileBrowser, Open WebUI\
**Home Automation**: Home Assistant, AdGuard Home\
**Infrastructure**: Traefik, Syncthing, WireGuard, Woodpecker CI, Watchtower,
ntfy

## Quick Setup

See main [README.md](../../README.md) for setup and deployment instructions.

## Services Configuration

### Vaultwarden (Password Manager)

SMTP configured for password resets and emergency access. Configure in `.env`:

```env
HOME_SMTP_HOST=mail.yourdomain.com
HOME_SMTP_PORT=587
HOME_SMTP_FROM=noreply@yourdomain.com
HOME_SMTP_USERNAME=noreply@yourdomain.com
HOME_SMTP_PASSWORD=<password>
```

Admin page: https://passwords.yourdomain.com/admin (enable
`VAULTWARDEN_ADMIN_TOKEN` temporarily)

### Home Assistant

Configure SMTP in Home Assistant UI:

- Settings → System → Network → Email
- Or via `configuration.yaml`

### AdGuard Home

DNS server blocking ads network-wide. Initial setup at
https://dns.yourdomain.com:3000 (first run only).

Configure devices to use server IP as DNS.

### Woodpecker CI

GitHub/Gitea/GitLab integration for CI/CD. Configure OAuth app and set
credentials in `.env`:

```env
HOME_WOODPECKER_GITHUB_CLIENT=<client-id>
HOME_WOODPECKER_GITHUB_SECRET=<client-secret>
HOME_WOODPECKER_ADMIN=<your-username>
```

### WireGuard VPN

Peer configurations in `.volumes/wireguard/`. Mobile clients at
https://www.wireguard.com/install/.

### Immich (Photos)

Photo management with mobile app backup. See `servers/home/immich/` for details.

## Web Access

- **Dashboard**: https://dash.yourdomain.com
- **Movies/TV**: https://movies.yourdomain.com
- **Photos**: https://photos.yourdomain.com
- **Passwords**: https://passwords.yourdomain.com
- **Files**: https://files.yourdomain.com
- **RSS**: https://rss.yourdomain.com
- **Books**: https://books.yourdomain.com
- **Home**: https://home.yourdomain.com
- **DNS**: https://dns.yourdomain.com
- **AI**: https://ai.yourdomain.com
- **Torrents**: https://torrents.yourdomain.com
- **Sync**: https://sync.yourdomain.com
- **CI**: https://ci.yourdomain.com
- **VPN**: vpn.yourdomain.com:51820
- **MeTube**: https://metube.yourdomain.com
- **Calendar/Contacts**: https://cal.yourdomain.com

## Backups

Backup configs in `servers/home/configs/backup/`. Automated daily at 2:30 AM.

Manual run:

```bash
deno run --env-file=.env -A scripts/backup/+main.ts
```

## Monitoring

ntfy notifications for:

- Hardware alerts (disk space, SSD health, temperature)
- Security (SSH failed logins, fail2ban bans)
- Backup status

Configure tokens in `.env`:

```env
HOME_NTFY_AUTH_TOKEN=tk_<your-token>
```

## Fedora-Specific

### Docker External Access Fix

If containers aren't accessible externally:

```bash
sudo iptables -I DOCKER-USER -j ACCEPT
```

Make permanent with systemd service (see `README_FEDORA.md`).

### SMART Monitoring

NVMe/SSD health monitoring with ntfy alerts. Configured via Ansible:

```bash
ansible-playbook ansible/playbooks/smart-monitoring.yml -K --limit home
```

## Common Tasks

```bash
# Check service status
docker compose ps

# Restart service
docker compose restart <service>

# View logs
docker compose logs -f <service>

# Update all containers
docker compose pull && docker compose up -d

# Check disk space
df -h

# Check Docker disk usage
docker system df
```

## Troubleshooting

### External Access Not Working

See `README_FEDORA.md` for Docker networking fix.

### Container Won't Start

```bash
# Check logs
docker logs <container>

# Check resources
docker stats

# Verify .env file
cat .env | grep -v "^#"
```

### Storage Issues

```bash
# Clean Docker system
docker system prune -a --volumes

# Check disk usage by directory
du -sh .volumes/*
```

## Notes

- All services behind Traefik reverse proxy with automatic SSL
- Cloudflare can be used for DNS (set proxy off for mail)
- VPN gives access to all services remotely
- AdGuard DNS should be configured on all devices for ad blocking
- Syncthing syncs backups to cloud and offsite servers
