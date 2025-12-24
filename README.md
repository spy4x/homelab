# Self-Hosted Infrastructure Framework

Infrastructure-as-code framework for managing multi-server Docker-based services with automated deployment, monitoring, and backups.

## Quick Start

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Install Ansible
# For Debian/Ubuntu
sudo apt update && sudo apt install -y ansible
# For Fedora/CentOS
sudo dnf install -y ansible

# Clone and setup
git clone https://github.com/spy4x/homelab.git ~/homelab && cd ~/homelab
cp servers/home/.env.example servers/home/.env  # Copy example env

# Edit servers/home/.env with your ssh params, domain, email, etc.
nano servers/home/.env # if using nano
# OR 
code servers/home/.env  # if using VSCode

# Configure server with Ansible - Install
deno task ansible ./ansible/playbooks/initial-setup/base.yml home 

# Deploy to server
deno task deploy home
```

## Documentation

- **[Get Started](docs/get-started-5min.md)** - Initial setup & deployment
- **[Architecture](docs/architecture.md)** - System design & data flow
- **[Adding Services](docs/adding-services.md)** - Service integration guide
- **[Troubleshooting](docs/troubleshooting.md)** - Debug common issues
- **[Backup System](scripts/backup/README.md)** - Restic-based backup details

## Example Servers

This repo includes three real servers as reference implementations:

- **home** - Primary services (media, automation, productivity)
- **cloud** - Email & external monitoring (Hetzner VPS)
- **offsite** - Backup replication (Raspberry Pi)

## Repository Structure

```
stacks/{name}/          # ALL service stacks (catalog)
  └── {service}/        # Traefik, Immich, etc.
      ├── compose.yml
      ├── backup.ts
      └── README.md
servers/{name}/         # Server-specific config
  ├── config.json       # Which stacks to deploy
  ├── .env             # Environment variables
  └── configs/         # Server-specific overrides
      └── backup/      # Non-service backups only
scripts/                # Management tools (Deno)
  ├── deploy/          # Deployment automation
  ├── backup/          # Backup system
  └── ansible/         # Ansible wrapper
ansible/                # Server provisioning
docs/                   # Framework documentation
```

## Available Services

**Infrastructure:**

- [Traefik](stacks/traefik/README.md) - Reverse proxy with automatic SSL
- [Watchtower](stacks/watchtower/README.md) - Automatic container updates
- [Gatus](stacks/gatus/README.md) - Health monitoring and status page
- [WireGuard](stacks/wireguard/README.md) - VPN server

**Communication & Notifications:**

- [ntfy](stacks/ntfy/README.md) - Push notifications
- [Mailserver](stacks/mailserver/README.md) - Self-hosted email server
- [Roundcube](stacks/roundcube/README.md) - Webmail client

**Media & Entertainment:**

- [Immich](stacks/immich/README.md) - Photo and video management
- [Jellyfin](stacks/jellyfin/README.md) - Media server
- [Audiobookshelf](stacks/audiobookshelf/README.md) - Audiobook & podcast server
- [Piped](stacks/piped/README.md) - YouTube alternative frontend
- [MeTube](stacks/metube/README.md) - YouTube downloader
- [Transmission](stacks/transmission/README.md) - Torrent client

**Productivity & Tools:**

- [Vaultwarden](stacks/vaultwarden/README.md) - Password manager (Bitwarden)
- [Open WebUI](stacks/open-webui/README.md) - AI chat interface
- [FreshRSS](stacks/freshrss/README.md) - RSS feed reader
- [FileBrowser](stacks/filebrowser/README.md) - Web-based file manager
- [Radicale](stacks/radicale/README.md) - CalDAV/CardDAV server
- [Syncthing](stacks/syncthing/README.md) - File synchronization

**Home Automation:**

- [Home Assistant](stacks/home-assistant/README.md) - Home automation platform
- [AdGuard](stacks/adguard/README.md) - Network-wide ad blocking

**Development:**

- [Woodpecker](stacks/woodpecker/README.md) - CI/CD server
- [Healthchecks](stacks/healthchecks/README.md) - Cron monitoring

**Web Server:**

- [Nginx](stacks/nginx/README.md) - Web server and reverse proxy

## Core Features

**Deployment** - Automated rsync + Docker Compose deployment via `deno task deploy`\
**Backups** - Restic-based with per-service configs, see [backup README](scripts/backup/README.md)\
**Monitoring** - Cross-server health checks (Gatus) + notifications (ntfy)\
**Provisioning** - Ansible playbooks for server hardening & maintenance\
**Service Discovery** - Traefik reverse proxy with automatic SSL

## Common Tasks

```bash
# Deploy server config
deno task deploy <server>

# SSH to server
deno task ssh <server>

# Run Ansible playbook
deno task ansible <playbook> <server>

# Manual backup
cd servers/<server> && deno run --env-file=.env -A ../../scripts/backup/+main.ts
```

See [server docs](servers/) for server-specific notes and [service docs](stacks/) for available services.
