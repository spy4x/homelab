# Homelab Server

This repository contains the configuration and setup for my homelab servers. The
services are organized into **Primary** and **Secondary** servers, each with its
own folder for better management. It's pretty lightweight and you can run it on
a Raspberry Pi or any other server.

## Prerequisites

- [Docker](https://get.docker.com/) installed and running
- Fedora/RHEL or Debian/Ubuntu server
- SSH access with key-based authentication

## Automation with Ansible

This homelab uses **Ansible** for automated server configuration and deployment.
Ansible lets you:

- Set up a fresh server in minutes
- Keep configurations consistent and documented
- Deploy services reliably
- Manage security settings automatically

### Quick Start with Ansible

1. **Install Ansible** (on your control machine - laptop/desktop):
   ```bash
   # Fedora/RHEL
   sudo dnf install ansible

   # Ubuntu/Debian
   sudo apt install ansible

   # macOS
   brew install ansible
   ```

2. **Configure environment** (first time only):
   ```bash
   cd ansible/
   cp .env.ansible.example .env.ansible
   # Edit .env.ansible with your server IP, port, and ntfy tokens
   ```

3. **Load environment variables**:
   ```bash
   # Load before running any playbook
   set -a && source .env.ansible && set +a
   ```

4. **Test connection**:
   ```bash
   ansible all -m ping
   ```

5. **Run playbooks**:
   ```bash
   # Complete initial setup (fresh server) - specify which server
   ansible-playbook site.yml -K --limit home          # Primary server (Fedora)
   ansible-playbook site.yml -K --limit offsite # Secondary server (Debian Pi)

   # Or run individual playbooks on specific server:
   ansible-playbook playbooks/initial-setup.yml -K --limit home
   ansible-playbook playbooks/ssh-hardening.yml -K --limit offsite
   ansible-playbook playbooks/fail2ban.yml -K --limit home
   ansible-playbook playbooks/smart-monitoring.yml -K --limit home
   ansible-playbook playbooks/backup-cronjob.yml -K --limit home
   ansible-playbook playbooks/maintenance.yml -K --limit offsite
   ansible-playbook playbooks/monitoring.yml -K --limit home

   # Run on ALL servers (omit --limit):
   ansible-playbook playbooks/ssh-hardening.yml -K
   ansible-playbook playbooks/maintenance.yml -K

   # Deploy services
   ansible-playbook playbooks/deploy.yml --limit home
   ```

   **Note:** Always specify `--limit home` or `--limit offsite` to target a
   specific server, or omit `--limit` to run on all servers.

### Available Playbooks

- **`site.yml`** - Complete server setup (runs all playbooks)
- **`initial-setup.yml`** - Install Docker, Deno, essential tools
- **`ssh-hardening.yml`** - Secure SSH (disable password auth, root login)
- **`fail2ban.yml`** - Protect against brute force attacks
- **`smart-monitoring.yml`** - Monitor SSD/NVMe health with ntfy alerts
- **`backup-cronjob.yml`** - Automated daily backups
- **`maintenance.yml`** - System updates, Docker cleanup, log rotation
- **`monitoring.yml`** - Container health checks, disk space, service
  availability
- **`deploy.yml`** - Deploy Docker services (replaces Makefile)
- **`fix-raspberry-pi.yml`** - Fix Raspberry Pi read-only boot partition and
  broken packages

For detailed Ansible documentation, see
[`ansible/README.md`](ansible/README.md).

## Services

### Primary Server (`server/`)

#### [Traefik](https://github.com/traefik/traefik)

Reverse proxy that routes requests by domain and handles SSL certificates with
Let's Encrypt.

#### [Uptime Kuma](https://github.com/louislam/uptime-kuma)

Monitoring tool to check website and API status.

#### [Transmission](https://github.com/transmission/transmission)

Lightweight BitTorrent client with web interface.

#### [MeTube](https://github.com/alexta69/metube)

Web GUI for youtube-dl with playlist support for downloading videos.

#### [Jellyfin](https://github.com/jellyfin/jellyfin)

Media server for hosting personal media libraries (movies, TV shows, music).

#### [Immich](https://github.com/immich-app/immich)

Self-hosted photo and video backup with automatic mobile backup.

#### [Vaultwarden](https://github.com/dani-garcia/vaultwarden)

Password manager compatible with Bitwarden clients.

#### [Watchtower](https://github.com/containrrr/watchtower)

Automatically updates Docker containers to latest versions.

#### [Homepage](./server/homepage/src/index.html)

Simple homepage with links to all services.

#### [WireGuard](https://www.wireguard.com/)

Modern, fast VPN server.

#### [Syncthing](https://syncthing.net/)

Continuous file synchronization between devices.

#### [Open WebUI](https://github.com/open-webui/open-webui)

AI-powered web interface for LLM backends.

#### [AudioBookshelf](https://github.com/advplyr/audiobookshelf)

Self-hosted audiobook and podcast server.

#### [Home Assistant](https://www.home-assistant.io/)

Home automation platform with local control.

#### [ntfy](https://ntfy.sh/)

Simple HTTP-based pub-sub notification service.

#### [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome)

Network-wide ad and tracker blocker with DNS server.

#### [Vikunja](https://vikunja.io/)

Self-hosted to-do list and project management.

#### [FileBrowser](https://filebrowser.org/)

Web-based file manager.

#### [FreshRSS](https://freshrss.org/)

Self-hosted RSS feed aggregator.

#### [Woodpecker CI](https://woodpecker-ci.org/)

Lightweight CI/CD platform.

### Secondary Server (`secondary/`)

See `secondary/compose.yml` for additional services.

## Manual Setup (Without Ansible)

If you prefer manual setup:

### 1. Create the `.env` File

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 2. Deploy the Stack

```bash
cd server/
make deploy
```

### 3. Access the Services

Access services using domain names specified in `.env`.

## Backup System

Automated backup system using Deno and Restic. See
[`server/scripts/backup/README.md`](server/scripts/backup/README.md) for
details.

Backups run daily at 2:30 AM via cron job (configured by Ansible).

Manual backup:

```bash
30 2 * * * USER=spy4x /home/spy4x/.deno/bin/deno run --env-file=/home/spy4x/ssd-2tb/apps/.env -A /home/spy4x/ssd-2tb/apps/scripts/backup/+main.ts >> /home/spy4x/backup.log 2>&1
```

## Security Features

- SSH hardening (key-only authentication, no root login)
- Fail2ban protection for SSH and Docker services
- Automated security updates
- SMART monitoring for drive health
- Container health monitoring
- Service availability checks

## Known Issues & Solutions

### Raspberry Pi: Read-only /boot/firmware

If you see errors like
`cp: cannot create regular file '/boot/firmware/...': Read-only file system`:

**Option 1: Run the fix playbook (recommended)**

```bash
ansible-playbook playbooks/fix-raspberry-pi.yml -K --limit offsite
```

This playbook will:

- Remount `/boot/firmware` as read-write
- Fix broken packages with `dpkg --configure -a`
- Clean up package system
- Optionally remount as read-only for safety

**Option 2: Manual fix**

```bash
# SSH into the Raspberry Pi
ssh spy4x-pi-external

# Remount boot partition as read-write
sudo mount -o remount,rw /boot/firmware

# Fix broken packages
sudo dpkg --configure -a

# Remount as read-only (optional, for safety)
sudo mount -o remount,ro /boot/firmware
```

**Note:** The `fail2ban.yml` and `maintenance.yml` playbooks now automatically
handle this issue, but you may need to run `fix-raspberry-pi.yml` first if there
are many broken packages.

## Monitoring & Alerts

All monitoring alerts are sent via ntfy:

- **Hardware alerts**: SSD health, disk space, container health
- **Security alerts**: Failed login attempts, IP bans

## Notes

- Ensure Docker runs as non-root user
- Use Ansible for reproducible setups
- Check logs for troubleshooting: `docker logs <container-name>`
- All automation configured via Ansible playbooks
