# Adding Services

Complete workflow for integrating new services into the infrastructure.

## Quick Checklist

1. ☐ Add service to `compose.yml` or create stack file
2. ☐ Add environment variables to `.env` and `.env.example`
3. ☐ Create backup config (if service has persistent data)
4. ☐ Deploy and verify
5. ☐ Add monitoring to Gatus

## Service Definition

### Option A: Server-Specific

Add to `servers/{server}/compose.yml`:

```yaml
services:
  myservice:
    image: myservice/myservice:latest
    container_name: myservice
    volumes:
      - ${VOLUMES_PATH}/myservice:/data
    networks: [proxy, default]
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myservice.rule=Host(`myservice.${DOMAIN}`)"
      - "traefik.http.routers.myservice.entrypoints=websecure"
      - "traefik.http.routers.myservice.tls.certresolver=myresolver"
```

### Option B: Reusable Stack

Create `sharedStacks/myservice/compose.yml`:

```yaml
name: ${PROJECT}
networks:
  proxy:
    external: true

services:
  myservice:
    image: myservice/myservice:latest
    container_name: myservice
    volumes:
      - ${VOLUMES_PATH}/myservice:/data
    networks: [proxy, default]
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myservice.rule=Host(`myservice.${DOMAIN}`)"
      - "traefik.http.routers.myservice.entrypoints=websecure"
      - "traefik.http.routers.myservice.tls.certresolver=myresolver"
```

Add to `servers/{server}/config.json`:
```json
{
  "sharedStacks": ["traefik", "myservice"]
}
```

## Environment Variables

Add to `servers/{server}/.env`:
```bash
#region MyService
MYSERVICE_API_KEY=actual_secret_value
#endregion
```

Add to `servers/{server}/.env.example`:
```bash
#region MyService
MYSERVICE_API_KEY=YOUR_API_KEY_HERE  # Get from https://myservice.com/settings
#endregion
```

## Backup Configuration

**Required for all services with persistent data.**

Create `servers/{server}/configs/backup/myservice.backup.ts`:

```typescript
import { BackupConfig } from "@scripts/backup"

export default {
  name: "myservice",
  sourcePaths: "default",        // Backs up ${VOLUMES_PATH}/myservice
  containers: { stop: "default" } // Stops container "myservice"
} as BackupConfig
```

**Skip backup config** for stateless services (config-only via env vars, no volumes).

### Advanced Backup Configs

**Multiple paths**:
```typescript
export default {
  name: "myservice",
  sourcePaths: [
    "${VOLUMES_PATH}/myservice/data",
    "${VOLUMES_PATH}/myservice/config"
  ],
  containers: { stop: ["myservice", "myservice-worker"] }
} as BackupConfig
```

**Shared service** (multiple servers):
```typescript
export default {
  name: "myservice",
  destName: "myservice-home", // Unique repo name per server
  sourcePaths: "default",
  containers: { stop: "default" }
} as BackupConfig
```

See [backup README](../scripts/backup/README.md) for full options.

## Deployment

```bash
deno task deploy <server>

# Verify
deno task ssh <server>
cd /opt/apps
docker compose ps
docker compose logs -f myservice
```

## Monitoring

Add to `servers/{server}/configs/gatus.yml`:

```yaml
endpoints:
  - name: MyService
    url: "https://myservice.yourdomain.com"
    interval: 5m
    conditions:
      - "[STATUS] == 200"
```

[Gatus docs](https://github.com/TwiN/gatus#configuration) for advanced checks.

## Common Patterns

### Service + Database

```yaml
services:
  myservice:
    image: myservice/myservice:latest
    depends_on: [myservice-db]
    environment:
      - DB_HOST=myservice-db
      - DB_PASSWORD=${MYSERVICE_DB_PASSWORD}
      
  myservice-db:
    image: postgres:16-alpine
    container_name: myservice-db
    volumes:
      - ${VOLUMES_PATH}/myservice/db:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=${MYSERVICE_DB_PASSWORD}
    restart: unless-stopped
```

### With Basic Auth

```yaml
labels:
  - "traefik.http.routers.myservice.middlewares=auth"
  - "traefik.http.middlewares.auth.basicauth.users=${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}"
```

See [Traefik middleware docs](https://doc.traefik.io/traefik/middlewares/http/overview/).

## Troubleshooting

**Container won't start**:
```bash
docker compose logs myservice
```

**Can't access via domain**:
```bash
docker compose logs traefik | grep myservice  # Check Traefik discovery
dig myservice.yourdomain.com                  # Verify DNS
```

**Backup fails**:
```bash
cd servers/<server>
deno run --env-file=.env -A ../../scripts/backup/+main.ts
```

See [troubleshooting guide](troubleshooting.md) for more solutions.
