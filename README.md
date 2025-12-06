# Homelab

Multi-server homelab infrastructure with automated configuration, monitoring,
and backups.

## 📚 Documentation

- **[Get Started in 5 Minutes](docs/get-started-5min.md)** - Quick setup guide
- **[Architecture Overview](docs/architecture.md)** - System design & topology
- **[Adding Services](docs/adding-services.md)** - Step-by-step service guide
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues & solutions

## Architecture

- **Home Server**: Primary services (Fedora, media, automation)
- **Cloud Server**: Email, monitoring, external services (Hetzner VPS)
- **Offsite Server**: Backup & sync replication (Raspberry Pi)

> 💡 **New to this homelab?** Start with the [5-minute quick start guide](docs/get-started-5min.md)

## Quick Start

### Prerequisites

- Deno installed locally
- Ansible installed locally (optional but recommended)
- SSH key-based authentication configured

### Initial Setup

```bash
# 1. Clone repository
git clone <your-repo-url> ~/homelab
cd ~/homelab

# 2. Configure environment
cp servers/home/.env.example servers/home/.env
# Edit servers/home/.env with your values

# 3. (Optional) Run Ansible initial setup
deno task ansible initial-setup

# 4. Deploy services
deno task deploy home

# 5. SSH to server and start services
deno task ssh home
cd ~/ssd-2tb/apps
docker compose up -d
```

For detailed instructions, see [Get Started in 5 Minutes](docs/get-started-5min.md).

## Repository Structure

```
├── ansible/                    # Shared Ansible config & playbooks
│   ├── inventory.yml          # All servers inventory
│   └── playbooks/             # All playbooks (shared + deploy)
├── scripts/                   # Shared scripts
│   └── backup/                # Consolidated backup system (Deno + Restic)
├── servers/
│   ├── home/                  # Home server (Fedora)
│   │   ├── compose.yml        # Docker services
│   │   ├── backup-configs/    # Service backup configurations
│   │   ├── homepage/          # Custom homepage
│   │   ├── immich/            # Photo management
│   │   └── piped/             # YouTube alternative
│   ├── cloud/                 # Cloud server (Hetzner VPS)
│   │   ├── compose.yml        # Mail & monitoring services
│   │   └── backup-configs/    # Service backup configurations
│   └── offsite/               # Offsite server (Raspberry Pi)
│       ├── compose.yml        # Sync & backup services
│       └── backup-configs/    # Service backup configurations
└── .env.example               # Shared environment variables template
```

## Services

### Home Server

**Media**: Jellyfin, Immich, AudioBookshelf, MeTube
**Productivity**: Vaultwarden, FreshRSS, FileBrowser, Open WebUI
**Home Automation**: Home Assistant, AdGuard Home
**Infrastructure**: Traefik, Syncthing, WireGuard, Woodpecker CI

### Cloud Server

**Email**: Docker Mail Server, Roundcube, Rspamd\
**Monitoring**: Gatus, Healthchecks, ntfy\
**Infrastructure**: Traefik, Syncthing

### Offsite Server

**Backup**: Syncthing replication, WireGuard

## Ansible Playbooks

### Running Playbooks

Use the Deno wrapper script for convenience (automatically loads environment variables):

```bash
# Complete setup for new server
deno task ansible ansible/site.yml <server>

# Individual playbooks
deno task ansible ansible/playbooks/initial-setup.yml <server>
deno task ansible ansible/playbooks/ssh-hardening.yml <server>
deno task ansible ansible/playbooks/fail2ban.yml <server>
deno task ansible ansible/playbooks/smart-monitoring.yml home
deno task ansible ansible/playbooks/backup-cronjob.yml <server>
deno task ansible ansible/playbooks/maintenance.yml <server>
deno task ansible ansible/playbooks/monitoring.yml <server>
```

The ansible wrapper script (`scripts/ansible/+main.ts`) automatically:

- Loads environment variables from root `.env`
- Loads Ansible-specific variables from `ansible/.env`
- Loads server-specific variables from `servers/<server>/.env`
- Passes the correct inventory and limit flags to ansible-playbook

### Deployment

Deploy services to a server using the Deno deployment script:

```bash
# Deploy to a specific server
deno task deploy home
deno task deploy cloud
deno task deploy offsite
```

The deploy script (`scripts/deploy/+main.ts`) automatically:

- Merges root `.env` with server-specific `.env` (server overrides root)
- Reads `config.json` to determine required stacks
- Merges `compose.yml` with stack files from `./stacks/` directory
- Syncs files to remote server via rsync
- Runs `docker compose up -d` to update services (only recreates changed containers)
- Cleans up temporary files

## Backups

Automated daily backups using Deno + Restic. See `scripts/backup/README.md`.

**Configure per server:**

- Add service configs to `servers/{server}/backup-configs/`
- Deploy cron job:
  `ansible-playbook ansible/playbooks/backup-cronjob.yml -K --limit <server>`

## Monitoring & Alerts

**Cross-server monitoring**: Each server monitors the others via Gatus/Uptime
Kuma\
**Notifications**: ntfy for alerts (hardware, security, uptime)\
**Channels**:

- Hardware: SSD health, disk space, temperature
- Security: Failed logins, IP bans (fail2ban)
- Uptime: Service availability, container health

## Email Configuration

Services with SMTP support are configured to use the cloud mail server:

- Vaultwarden: Password resets, emergency access
- Home Assistant: Automation notifications
- Healthchecks: Cron job monitoring alerts
- Woodpecker CI: Build notifications

SMTP details in `.env` with `CLOUD_SMTP_*` or `HOME_SMTP_*` prefix.

## Common Tasks

### Managing Services

```bash
# SSH to server
ssh <server>

# Check services
docker compose ps
docker compose logs -f <service>

# Restart service
docker compose restart <service>

# Update all services
docker compose pull && docker compose up -d
```

### Email Management (Cloud Server)

```bash
# SSH to cloud server
cd /opt/cloud

# Manage users
docker exec -it mailserver setup email add user@domain.com
docker exec -it mailserver setup email list
docker exec -it mailserver setup email del user@domain.com

# Manage aliases
docker exec -it mailserver setup alias add alias@domain.com target@domain.com

# Show DKIM key for DNS
docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/*/mail.txt

# Check mail queue
docker exec mailserver postqueue -p
```

### Backup Management

```bash
# Manual backup run
deno run --env-file=.env -A scripts/backup/+main.ts

# Check backup logs
tail -f ~/backup.log

# Restore from backup
export RESTIC_PASSWORD="your-backup-password"
restic -r /path/to/repo snapshots
restic -r /path/to/repo restore <snapshot-id> --target <target-dir>
```

## Security

- SSH: Key-only authentication, custom ports, fail2ban
- Docker: Non-root users, security-opt flags, resource limits
- SSL/TLS: Automated Let's Encrypt certificates via Traefik
- Firewall: Minimal open ports, UFW/firewalld rules
- Updates: Automated via Watchtower (containers) and Ansible (system)

## Troubleshooting

### Fedora Docker Networking

If external access to Docker containers fails on Fedora:

```bash
# Apply immediate fix
sudo iptables -I DOCKER-USER -j ACCEPT

# Make permanent (create systemd service)
sudo tee /etc/systemd/system/docker-external-access.service << 'EOF'
[Unit]
Description=Allow external access to Docker containers
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/sbin/iptables -I DOCKER-USER -j ACCEPT
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable docker-external-access.service
```

### Raspberry Pi Boot Partition Read-only

```bash
# Run fix playbook
ansible-playbook ansible/playbooks/fix-raspberry-pi.yml -K --limit offsite

# Or manual fix
ssh <offsite-server>
sudo mount -o remount,rw /boot/firmware
sudo dpkg --configure -a
```

### Check Service Health

```bash
# View errors
docker compose ps
docker logs <container> --tail 100

# Check resource usage
docker stats

# Test connectivity
curl -I https://<service-domain>
```

## Documentation

- **[Get Started in 5 Minutes](docs/get-started-5min.md)** - Quick setup for new servers
- **[Architecture Overview](docs/architecture.md)** - System design, topology & data flow
- **[Adding Services Guide](docs/adding-services.md)** - Complete service deployment workflow
- **[Troubleshooting Guide](docs/troubleshooting.md)** - Common issues & debugging
- **Backup System**: `scripts/backup/README.md` - Backup implementation details
- **Cloud/Email Setup**: `servers/cloud/README.md` - Mail server configuration
- **Fedora Networking**: `servers/home/README_FEDORA.md` - Fedora-specific fixes

## Contributing

This is a personal homelab setup. Feel free to use as reference for your own
infrastructure.

**Maintained by**: Anton Shubin (@spy4x)\
**License**: MIT
