# Adding Services to Homelab

This guide walks through adding a new service to your homelab infrastructure.

## Quick Start

1. Create service definition
2. Add backup configuration
3. Deploy to server
4. Add monitoring

## Step-by-Step Guide

### 1. Choose Service Location

Decide which server will host the service:

- **Home**: Media services, personal apps, resource-intensive services
- **Cloud**: Public services, email, notifications, high-uptime requirements
- **Offsite**: Monitoring, backup storage, lightweight services

### 2. Create Service Definition

#### Option A: Shared Stack (Multi-Server)

Create `/stacks/myservice.yml`:

```yaml
name: ${PROJECT}

networks:
  proxy:
    external: true

services:
  myservice:
    container_name: myservice
    image: myservice/myservice:latest
    volumes:
      - ./.volumes/myservice:/data
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: ${MYSERVICE_CPU_LIMIT:-1}
          memory: ${MYSERVICE_MEM_LIMIT:-512M}
    security_opt:
      - no-new-privileges:true
    networks:
      - proxy
      - default
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=proxy"
      - "traefik.http.services.myservice.loadbalancer.server.port=8080"
      - "traefik.http.routers.myservice.rule=Host(`myservice.${DOMAIN}`)"
      - "traefik.http.routers.myservice.entrypoints=websecure"
      - "traefik.http.routers.myservice.tls=true"
      - "traefik.http.routers.myservice.tls.certresolver=myresolver"
```

Then add to server's `config.json`:
```json
{
  "sharedStacks": ["proxy", "watchtower", "myservice"]
}
```

#### Option B: Server-Specific Service

Add to `/servers/home/compose.yml`:

```yaml
services:
  myservice:
    container_name: myservice
    image: myservice/myservice:latest
    environment:
      - TZ=${TIMEZONE:-UTC}
    volumes:
      - ./.volumes/myservice:/data
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1"
    security_opt:
      - no-new-privileges:true
    networks:
      - proxy
      - default
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=proxy"
      - "traefik.http.services.myservice.loadbalancer.server.port=8080"
      - "traefik.http.routers.myservice.rule=Host(`myservice.${DOMAIN}`)"
      - "traefik.http.routers.myservice.entrypoints=websecure"
      - "traefik.http.routers.myservice.tls=true"
      - "traefik.http.routers.myservice.tls.certresolver=myresolver"
```

### 3. Add Environment Variables

Add to `/servers/<server>/.env`:

```bash
#region MyService
MYSERVICE_CPU_LIMIT=1
MYSERVICE_MEM_LIMIT=512M
# Add any service-specific variables
MYSERVICE_API_KEY=your-api-key-here
#endregion MyService
```

And to `.env.example`:
```bash
#region MyService
MYSERVICE_CPU_LIMIT=1
MYSERVICE_MEM_LIMIT=512M
MYSERVICE_API_KEY=YOUR_API_KEY_HERE  # Get from https://myservice.com/settings
#endregion MyService
```

### 4. Create Backup Configuration

**CRITICAL**: Every service with persistent data needs a backup config.

Create `/servers/<server>/backup-configs/myservice.backup.ts`:

```typescript
import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "myservice",
  sourcePaths: "default", // Uses ./.volumes/myservice
  containers: {
    stop: "default", // Stops container named "myservice"
  },
}

export default backupConfig
```

#### For Shared Services

Add `destName` to distinguish between servers:

```typescript
const backupConfig: BackupConfig = {
  name: "myservice",
  destName: "myservice-home", // Or myservice-cloud, myservice-offsite
  sourcePaths: "default",
  containers: {
    stop: "default",
  },
}
```

#### Custom Backup Paths

For non-standard configurations:

```typescript
const backupConfig: BackupConfig = {
  name: "myservice",
  sourcePaths: [
    "./.volumes/myservice/data",
    "./.volumes/myservice/config",
  ],
  pathsToChangeOwnership: [
    "./.volumes/myservice",
  ],
  containers: {
    stop: ["myservice", "myservice-worker"], // Multiple containers
  },
}
```

#### Skip Backup for Stateless Services

If service has no persistent data (configuration only from compose/env):
- **DO NOT** create a backup config
- Examples: NFS server, pure proxies, stateless workers

### 5. Deploy Service

```bash
# Deploy to server
deno task deploy home

# Verify deployment
ssh spy4x-server-home
cd ~/ssd-2tb/apps
docker compose ps
docker compose logs -f myservice
```

### 6. Add Monitoring

Add to `/servers/<server>/configs/gatus.yml`:

```yaml
endpoints:
  - name: MyService
    url: "https://myservice.yourdomain.com"
    interval: 5m
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 1000"
    alerts:
      - type: ntfy
        failure-threshold: 2
        success-threshold: 2
        send-on-resolved: true
```

Redeploy to apply monitoring:
```bash
deno task deploy home
```

### 7. Update Homepage

Add service to `/servers/home/homepage/src/index.html`:

```html
<a href="https://myservice.yourdomain.com" target="_blank" rel="noopener noreferrer">
  <div class="card">
    <span class="icon">🎯</span>
    <h2>MyService</h2>
    <p>Service description</p>
  </div>
</a>
```

## Testing

### 1. Container Health
```bash
docker compose ps
docker compose logs -f myservice
```

### 2. Network Connectivity
```bash
# From host
curl -I https://myservice.yourdomain.com

# Check Traefik dashboard
# https://proxy.yourdomain.com
```

### 3. Backup Verification
```bash
# Run manual backup
deno task backup

# Check backup repo was created
ls -lh ~/sync/backups/myservice

# List snapshots
export RESTIC_PASSWORD='your-backup-password'
restic -r ~/sync/backups/myservice snapshots
```

### 4. Monitoring Check
```bash
# View Gatus dashboard
# https://uptime.yourdomain.com

# Check service appears and is healthy
```

## Common Patterns

### With Database

```yaml
services:
  myservice:
    # ... service config ...
    depends_on:
      - myservice-db
    environment:
      - DB_HOST=myservice-db
      - DB_NAME=myservice
      - DB_USER=${MYSERVICE_DB_USER}
      - DB_PASSWORD=${MYSERVICE_DB_PASSWORD}

  myservice-db:
    container_name: myservice-db
    image: postgres:16-alpine
    volumes:
      - ./.volumes/myservice/db:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=myservice
      - POSTGRES_USER=${MYSERVICE_DB_USER}
      - POSTGRES_PASSWORD=${MYSERVICE_DB_PASSWORD}
    restart: unless-stopped
```

### With Authentication

```yaml
labels:
  # ... other labels ...
  - "traefik.http.routers.myservice.middlewares=auth"
  - "traefik.http.middlewares.auth.basicauth.users=${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}"
```

### Resource-Intensive Service

```yaml
deploy:
  resources:
    limits:
      cpus: "4"
      memory: 8192M
    reservations:
      cpus: "2"
      memory: 4096M
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker compose logs myservice

# Check if volume permissions issue
sudo ls -la ./.volumes/myservice

# Fix permissions
sudo chown -R $USER:$USER ./.volumes/myservice
```

### Can't Access via Domain
```bash
# Check Traefik can see container
docker compose logs proxy | grep myservice

# Check DNS
dig myservice.yourdomain.com

# Check Traefik labels
docker inspect myservice | grep -A 20 Labels
```

### Backup Fails
```bash
# Check backup config exists
ls -la backup-configs/myservice.backup.ts

# Run backup with verbose logging
deno task backup 2>&1 | tee backup.log

# Check container can be stopped
docker compose stop myservice && docker compose start myservice
```

## Best Practices

1. **Always add backup config** for services with data
2. **Use default resource limits** in stack files
3. **Add monitoring** for all public services
4. **Test locally** before deploying to production
5. **Document** service-specific configuration in comments
6. **Use secrets** via .env files, never hardcode
7. **Follow naming** conventions (kebab-case for services)
8. **Add to homepage** for easy access
