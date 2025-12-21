# Architecture

Infrastructure-as-code framework for multi-server Docker deployments.

## Design Principles

**Infrastructure as Code** - All configuration in Git  
**Composition** - Reusable stacks shared across servers  
**Automation** - Deploy, backup, monitor without manual steps  
**Redundancy** - Cross-server monitoring and backup replication

## Core Components

### Docker Compose Stacks

Services organized in layers:

```
sharedStacks/        # Reusable across servers (traefik, gatus, etc.)
  └── traefik/
servers/{name}/
  ├── localStacks/   # Server-specific (immich, piped, etc.)
  └── compose.yml    # Final configuration layer
```

**Priority**: sharedStacks → localStacks → compose.yml (highest)

### Traefik Reverse Proxy

- Automatic SSL via [Let's Encrypt](https://doc.traefik.io/traefik/https/acme/)
- Service discovery via [Docker provider](https://doc.traefik.io/traefik/providers/docker/)
- Subdomain routing: `service.domain.com`
- Configured via Docker labels

### Restic Backups

- Per-service backup configs in `servers/{name}/configs/backup/`
- [Restic](https://restic.readthedocs.io/) for encrypted, deduplicated backups
- Syncthing replicates repos across servers
- See [backup README](../scripts/backup/README.md) for details

### Cross-Server Monitoring

- [Gatus](https://github.com/TwiN/gatus) for health checks
- Each server monitors others (failure detection without single point)
- [ntfy](https://docs.ntfy.sh/) for push notifications

### Deployment Automation

`deno task deploy <server>`:
1. Reads `servers/{server}/config.json` for required stacks
2. Merges sharedStacks + localStacks + compose.yml
3. Syncs to server via rsync
4. Runs `docker compose up -d`

## Example: 3-Server Setup

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│   home   │◄───────►│  cloud   │◄───────►│ offsite  │
│  Fedora  │         │Hetzner VPS│         │  RPi 4   │
└──────────┘         └──────────┘         └──────────┘
     │                    │                     │
  Services            Email/Ntfy          Backups Only
```

**home** - Primary services (media, automation, productivity)  
**cloud** - Public services (email, external monitoring)  
**offsite** - Backup replication via Syncthing

Each runs: Traefik, Gatus, Syncthing, Watchtower

## Data Flows

**Service Access**:  
DNS → Traefik → Container → Application

**Backups**:  
Service data → Restic → Local repo → Syncthing → Remote servers

**Monitoring**:  
Gatus HTTP check → Failure → ntfy notification

## Adding Servers

1. Create `servers/{name}/` with compose.yml, .env, config.json
2. Add to `ansible/inventory.yml`
3. Run `deno task ansible ansible/site.yml {name}`
4. Deploy: `deno task deploy {name}`

See individual [server docs](../servers/) for specific configurations.
