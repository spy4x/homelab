# Homelab Architecture

## Overview

This homelab uses a three-server architecture with Docker Compose for service orchestration, Traefik for reverse proxy, and automated backups via Restic.

## Server Topology

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│    Home     │────▶│    Cloud     │────▶│   Offsite   │
│   Server    │     │     VPS      │     │  Raspberry  │
│  (Fedora)   │     │  (Hetzner)   │     │     Pi      │
└─────────────┘     └──────────────┘     └─────────────┘
      │                    │                     │
      │                    │                     │
   Services            Mail Server          Monitoring
   & Media             & Ntfy               & Backups
```

### Home Server
- **Hardware**: Mini PC (Fedora)
- **Primary Services**: Jellyfin, Immich, Home Assistant, Transmission
- **Storage**: Local SSD for apps, external drives for media
- **Purpose**: Main application hosting and media server

### Cloud Server
- **Hardware**: Hetzner VPS
- **Primary Services**: Mail server, Webmail (Roundcube), Ntfy, Healthchecks
- **Purpose**: Public-facing services requiring high uptime
- **Connectivity**: Public IP, 24/7 availability

### Offsite Server
- **Hardware**: Raspberry Pi (Debian)
- **Primary Services**: Gatus monitoring, Syncthing sync target
- **Purpose**: Remote monitoring and backup storage
- **Connectivity**: Different physical location for disaster recovery

## Shared Services

These services run on multiple servers for redundancy:

- **Traefik**: Reverse proxy with Let's Encrypt SSL
- **Gatus**: Health monitoring (cross-server checks)
- **Syncthing**: File synchronization for backups
- **Watchtower**: Container auto-updates
- **Ntfy**: Notification delivery

## Network Architecture

### Proxy Network
- All services connect to `hl_default` Docker network
- Traefik provides SSL termination and routing
- Services exposed via subdomains (e.g., `movies.yourdomain.com`)

### Monitoring Setup
- **Home → Cloud**: Monitors cloud services from home
- **Cloud → Home**: Monitors home services from cloud
- **Both → Offsite**: Monitor offsite availability
- **Ntfy**: Delivers alerts for failures

### Backup Strategy
1. **Restic** backs up service data to local Syncthing folders
2. **Syncthing** syncs backup repos across all servers
3. **Offsite** maintains full backup copies
4. Each server can restore from its local sync folder

## Deployment Architecture

### Stack System
Services are organized into:

1. **Shared Stacks** (`/sharedStacks/*.yml`):
   - Reusable compose files
   - Used across multiple servers
   - Examples: traefik, watchtower, syncthing

2. **Local Stacks** (e.g., `/servers/home/localStacks/immich/compose.yml`):
   - Server-specific services
   - Can override shared stack settings

3. **Server Compose** (`/servers/*/compose.yml`):
   - Final override layer
   - Server-specific configurations

### Configuration Priority
```
Shared Stack → Local Stack → Server Compose
(lowest)                      (highest)
```

## Technology Stack

### Infrastructure
- **Docker & Docker Compose**: Container orchestration
- **Traefik**: Reverse proxy & SSL management
- **Ansible**: Server provisioning & configuration

### Backups
- **Restic**: Encrypted, deduplicated backups
- **Syncthing**: Multi-server sync
- **Deno**: Backup automation scripts

### Monitoring
- **Gatus**: HTTP/TCP health checks
- **Ntfy**: Push notifications
- **Fail2ban**: Brute-force protection

### Development
- **Deno**: TypeScript runtime for automation
- **Git**: Version control
- **VS Code**: Development environment

## Data Flow

### Service Access
```
User → Domain (DNS)
     → Traefik (proxy)
     → Docker Container
     → Service Application
```

### Backup Flow
```
Service Data → Restic Backup
            → Local Sync Folder
            → Syncthing Network
            → Remote Servers
```

### Monitoring Flow
```
Gatus (monitoring)
  → HTTP/TCP Check
  → Success/Failure
  → Ntfy Alert (on failure)
  → Push Notification
```

## Security Model

### Network Security
- **Firewalls**: UFW on all servers
- **Fail2ban**: Automated IP blocking
- **SSH**: Key-only authentication, non-standard ports
- **SSL**: Let's Encrypt certificates via Traefik

### Service Security
- **Isolation**: Each service in separate container
- **No root**: Containers run as non-root users
- **Secrets**: Stored in `.env` files (gitignored)
- **Updates**: Watchtower auto-updates containers

### Backup Security
- **Encryption**: Restic encrypts all backup data
- **Password**: Single backup password for all repos
- **Access**: Backups stored in restricted directories
- **Replication**: Multiple copies on different servers

## Scalability Considerations

### Adding Services
1. Create service compose file
2. Add backup configuration
3. Deploy via `deno task deploy <server>`
4. Add monitoring checks to Gatus

### Adding Servers
1. Run initial Ansible playbook
2. Create server config in `/servers/`
3. Add to inventory and configure stacks
4. Deploy and verify

### Resource Management
- CPU/Memory limits defined per service
- Default values in stack files
- Override per server as needed
