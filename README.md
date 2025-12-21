# Self-Hosted Infrastructure Framework

Infrastructure-as-code framework for managing multi-server Docker-based services with automated deployment, monitoring, and backups.

## Quick Start

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Clone and setup
git clone https://github.com/spy4x/homelab.git ~/homelab && cd ~/homelab
cp servers/home/.env.example servers/home/.env  # Copy example env
# Edit servers/home/.env with your ssh params, domain, email, etc.

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
