# Homelab Troubleshooting Guide

## Common Issues & Solutions

### Deployment Issues

#### Import Resolution Errors

**Symptom**: `Import "<path>" is not a dependency`

**Cause**: Dynamic imports don't respect Deno import maps in `deno.jsonc`

**Solution**: Use relative imports in dynamically loaded files
```typescript
// ❌ Don't use
import { BackupConfig } from "@scripts/backup"

// ✅ Do use
import { BackupConfig } from "@scripts/backup"
```

#### Missing Environment Variables

**Symptom**: Script fails with "Environment variable X not found"

**Cause**: Required variable not in `.env` file

**Solution**:
1. Check `.env.example` for required variables
2. Add missing variables to `.env`
3. Make optional variables truly optional in code:
```typescript
const slackWebhook = getEnvVar("SLACK_WEBHOOK_URL", true) // true = optional
```

#### Container Port Conflicts

**Symptom**: `port is already allocated`

**Cause**: Another container or process using the same port

**Solution**:
```bash
# Find what's using the port
sudo lsof -i :8080

# Stop conflicting container
docker compose stop <conflicting-service>

# Or change port in compose file
ports:
  - "8081:8080" # Use different host port
```

### Backup Issues

#### Backup Fails with Permission Denied

**Symptom**: `permission denied` when backing up service data

**Cause**: Backup script can't read service volumes

**Solution**:
```bash
# Check current permissions
ls -la .volumes/myservice

# Fix ownership (run as root on remote server)
sudo chown -R spy4x:spy4x .volumes/myservice
```

#### Restic Repository Not Found

**Symptom**: `repository does not exist`

**Cause**: Backup hasn't been initialized yet

**Solution**:
```bash
# Initialize backup repo manually
export RESTIC_PASSWORD='your-backup-password'
restic init -r ~/sync/backups/myservice
```

#### Container Won't Stop During Backup

**Symptom**: Backup times out waiting for container to stop

**Cause**: Container stuck or has long shutdown time

**Solution**:
1. Increase timeout in backup config:
```typescript
const backupConfig: BackupConfig = {
  name: "myservice",
  sourcePaths: "default",
  containers: {
    stop: "default",
    timeout: 60, // Seconds to wait
  },
}
```

2. Or manually stop before backup:
```bash
docker compose stop myservice
deno task backup
docker compose start myservice
```

### Traefik & Networking

#### SSL Certificate Not Issued

**Symptom**: Browser shows SSL error for service

**Cause**: Let's Encrypt can't reach service or rate limited

**Solution**:
```bash
# Check Traefik logs
docker compose logs traefik | grep -i error

# Verify DNS points to server
dig myservice.yourdomain.com

# Check Traefik can reach container
docker compose exec traefik wget -O- http://myservice:8080

# Wait if rate limited (Let's Encrypt: 5 failures/hour)
```

#### Service Not Accessible Behind Traefik

**Symptom**: 404 or Gateway Timeout accessing service

**Cause**: Incorrect Traefik labels or network configuration

**Solution**:
```bash
# Check service is on proxy network
docker inspect myservice | grep Networks -A 5

# Verify Traefik sees the service
docker compose logs proxy | grep myservice

# Check labels are correct
docker inspect myservice | grep -A 20 Labels

# Test direct container access
docker compose exec proxy wget -O- http://myservice:8080
```

#### CORS Errors on Frontend

**Symptom**: Browser console shows CORS errors

**Cause**: Missing CORS headers

**Solution**: Add Traefik middleware
```yaml
labels:
  - "traefik.http.routers.myservice.middlewares=cors"
  - "traefik.http.middlewares.cors.headers.accesscontrolallowmethods=GET,POST,PUT,DELETE,OPTIONS"
  - "traefik.http.middlewares.cors.headers.accesscontrolalloworigin=*"
```

### Docker Compose Issues

#### Compose File Not Found

**Symptom**: `compose.yml: no such file or directory`

**Cause**: Wrong working directory or compose not deployed

**Solution**:
```bash
# Check if deployed
ssh spy4x-server-home
cd ~/ssd-2tb/apps
ls -la compose.yml

# Redeploy if missing
deno task deploy home
```

#### Multiple Compose Files Not Merging

**Symptom**: Service from stack file not appearing

**Cause**: Stack not listed in `config.json` or wrong file order

**Solution**:
1. Check `servers/<server>/config.json`:
```json
{
  "sharedStacks": ["traefik", "watchtower", "myservice"]
}
```

2. Verify stack file exists:
```bash
ls -la sharedStacks/myservice.yml
```

3. Redeploy to apply changes

### Monitoring Issues

#### Gatus Shows Service as Down

**Symptom**: Green checkmark missing in Gatus dashboard

**Cause**: Service unreachable or check configuration wrong

**Solution**:
```bash
# Test endpoint manually
curl -I https://myservice.yourdomain.com

# Check Gatus logs
docker compose logs gatus

# Verify check configuration in gatus.yml
cat configs/gatus.yml | grep -A 10 myservice
```

#### Ntfy Notifications Not Received

**Symptom**: No push notifications on service failure

**Cause**: Ntfy not configured or credentials wrong

**Solution**:
```bash
# Test ntfy manually
curl -H "Authorization: Bearer $NTFY_AUTH_TOKEN" \
  -d "Test notification" \
  https://ntfy.yourdomain.com/homelab-alerts

# Check Gatus ntfy configuration
docker compose exec gatus cat /config/gatus.yml | grep -A 5 ntfy

# Verify NTFY_URL and NTFY_AUTH_TOKEN in .env
```

### SSH & Connection Issues

#### SSH Connection Refused

**Symptom**: `Connection refused` when SSH'ing to server

**Cause**: SSH service not running or firewall blocking

**Solution**:
```bash
# Check SSH service (from local network)
ping server-ip
telnet server-ip 22

# Restart SSH (requires physical/console access)
sudo systemctl restart sshd

# Check firewall rules
sudo ufw status
sudo ufw allow 22/tcp
```

#### SSH Key Authentication Fails

**Symptom**: Prompted for password despite having key

**Cause**: Wrong key, key not in authorized_keys, or permissions

**Solution**:
```bash
# Verify key is loaded
ssh-add -l

# Check permissions
ls -la ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519

# Verify authorized_keys on server (via password login)
cat ~/.ssh/authorized_keys | grep "$(cat ~/.ssh/id_ed25519.pub)"
```

### System Resource Issues

#### Server Running Out of Space

**Symptom**: `no space left on device`

**Cause**: Docker images, logs, or backups filling disk

**Solution**:
```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Clean up unused images/containers
docker system prune -a

# Clean up old logs
sudo journalctl --vacuum-time=7d

# Check backup sizes
du -sh ~/sync/backups/*

# Prune old backup snapshots
export RESTIC_PASSWORD='your-password'
restic -r ~/sync/backups/myservice forget --keep-daily 7 --keep-weekly 4 --prune
```

#### High CPU/Memory Usage

**Symptom**: Server slow or unresponsive

**Cause**: Service consuming too many resources

**Solution**:
```bash
# Check container resources
docker stats

# Identify resource hog
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Add/adjust resource limits
# In compose.yml:
deploy:
  resources:
    limits:
      cpus: "2"
      memory: 2048M

# Apply changes
docker compose up -d myservice
```

## Debugging Techniques

### Enable Verbose Logging

Add to backup script temporarily:
```bash
# In scripts/backup/+main.ts
console.log("DEBUG: Config loaded:", config)
```

### Check Container Logs
```bash
# Follow logs in real-time
docker compose logs -f myservice

# Last 100 lines
docker compose logs --tail=100 myservice

# With timestamps
docker compose logs -t myservice
```

### Inspect Container State
```bash
# Full container config
docker inspect myservice

# Just networking
docker inspect myservice | jq '.[0].NetworkSettings'

# Environment variables
docker inspect myservice | jq '.[0].Config.Env'
```

### Test Backup Manually
```bash
# Set environment
export RESTIC_PASSWORD='your-password'
export RESTIC_REPOSITORY=~/sync/backups/myservice

# Test backup
restic backup /path/to/data

# List snapshots
restic snapshots

# Check repo integrity
restic check
```

### Validate Compose Files
```bash
# Check syntax
docker compose config

# Dry-run deployment
docker compose up --dry-run

# Validate specific file
docker compose -f sharedStacks/myservice.yml config
```

## Recovery Procedures

### Restore from Backup

```bash
# List available snapshots
deno task restore

# Follow interactive prompts:
# 1. Select server
# 2. Select service
# 3. Choose snapshot
# 4. Confirm restoration

# Manual restoration if script fails:
export RESTIC_PASSWORD='your-password'
restic -r ~/sync/backups/myservice snapshots
restic -r ~/sync/backups/myservice restore latest --target /tmp/restore
docker compose stop myservice
sudo mv .volumes/myservice .volumes/myservice.backup
sudo mv /tmp/restore/.volumes/myservice .volumes/myservice
docker compose start myservice
```

### Rollback Deployment

```bash
# If deploy breaks something, rollback
cd ~/ssd-2tb/apps
git log --oneline
git reset --hard HEAD~1  # Go back one commit
docker compose up -d
```

### Rebuild Container from Scratch

```bash
# Stop and remove container
docker compose stop myservice
docker compose rm myservice

# Remove volumes (CAREFUL - deletes data)
sudo rm -rf .volumes/myservice

# Pull fresh image
docker compose pull myservice

# Start with clean state
docker compose up -d myservice
```

## Getting Help

### Logs to Collect

When asking for help, provide:
1. Error message from command output
2. Container logs: `docker compose logs myservice`
3. Compose configuration: `docker compose config`
4. System info: `docker version`, `docker compose version`

### Useful Commands

```bash
# System health check
deno task deploy <server> --dry-run  # Simulate deployment
docker ps -a  # All containers
docker compose ps  # Services in current compose
df -h  # Disk usage
free -h  # Memory usage
docker system df  # Docker disk usage

# Network debugging
docker network ls  # List networks
docker network inspect hl_default  # Network details
ss -tulpn  # Open ports

# Quick service restart
docker compose restart myservice

# Force recreate container
docker compose up -d --force-recreate myservice
```
