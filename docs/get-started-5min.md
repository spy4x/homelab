# 5-Minute Quick Start

Get your homelab server running with Docker services in under 5 minutes.

## Prerequisites

- Linux server (Ubuntu, Debian, Fedora, or Raspberry Pi OS)
- SSH access with sudo privileges
- Domain name with DNS configured
- Basic familiarity with terminal

## Step 1: Initial Server Setup (2 min)

```bash
# Clone repository
git clone <your-repo-url> ~/homelab
cd ~/homelab

# Install dependencies
curl -fsSL https://deno.land/install.sh | sh

# Add Deno to PATH (add to ~/.bashrc or ~/.zshrc)
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
```

## Step 2: Configure Server (1 min)

Create `servers/home/.env` based on `.env.example`:

```bash
# Copy example
cp servers/home/.env.example servers/home/.env

# Edit with your values
nano servers/home/.env
```

**Minimum required variables:**
```bash
PROJECT=hl
DOMAIN=yourdomain.com
TIMEZONE=America/New_York
ACME_EMAIL=you@email.com
BASIC_AUTH_USER=admin
BASIC_AUTH_PASSWORD=$(openssl passwd -apr1 YourPassword)
RESTIC_PASSWORD=$(head -c 32 /dev/urandom | base64 | head -c 32)
SSH_ADDRESS=your-server-ip-or-hostname
```

## Step 3: Initial Ansible Setup (Optional but Recommended)

```bash
# Install Ansible
pip install ansible

# Update inventory with your server IP
nano ansible/inventory.yml

# Run initial setup (installs Docker, configures firewall)
deno task ansible initial-setup
```

**OR** manually install Docker:
```bash
# For Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

## Step 4: Deploy Services (1 min)

```bash
# Deploy base services (Traefik proxy + Watchtower)
deno task deploy home

# SSH to server and start services
deno task ssh home
cd ~/ssd-2tb/apps
docker compose up -d
```

## Step 5: Verify Deployment (1 min)

```bash
# Check containers are running
docker compose ps

# Check logs
docker compose logs -f proxy

# Test web access
curl -I https://proxy.yourdomain.com
```

## What's Running?

After deployment you have:
- **Traefik**: Reverse proxy at `https://proxy.yourdomain.com`
- **Watchtower**: Auto-updates containers
- SSL certificates from Let's Encrypt

## Next Steps

### Add Your First Service

1. **Choose a service** (example: [Vaultwarden](https://github.com/dani-garcia/vaultwarden) password manager)

2. **Add to compose file** `servers/home/compose.yml`:
```yaml
services:
  vaultwarden:
    container_name: vaultwarden
    image: vaultwarden/server:latest
    volumes:
      - ./.volumes/vaultwarden:/data
    restart: unless-stopped
    networks:
      - proxy
      - default
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=proxy"
      - "traefik.http.services.vaultwarden.loadbalancer.server.port=80"
      - "traefik.http.routers.vaultwarden.rule=Host(`vault.${DOMAIN}`)"
      - "traefik.http.routers.vaultwarden.entrypoints=websecure"
      - "traefik.http.routers.vaultwarden.tls.certresolver=myresolver"
```

3. **Create backup config** `servers/home/backup-configs/vaultwarden.backup.ts`:
```typescript
import { BackupConfig } from "../scripts/backup/src/+lib.ts"

const backupConfig: BackupConfig = {
  name: "vaultwarden",
  sourcePaths: "default",
  containers: { stop: "default" },
}

export default backupConfig
```

4. **Deploy**:
```bash
deno task deploy home
```

5. **Access**: `https://vault.yourdomain.com`

### Set Up Backups

```bash
# Run first backup
deno task backup

# Set up automated backups via cron (on server):
crontab -e

# Add line for daily 2 AM backup:
0 2 * * * cd ~/ssd-2tb/apps && /home/spy4x/.deno/bin/deno task backup
```

### Add Monitoring

Add to `servers/home/configs/gatus.yml`:
```yaml
endpoints:
  - name: Vaultwarden
    url: "https://vault.yourdomain.com"
    interval: 5m
    conditions:
      - "[STATUS] == 200"
```

Redeploy to apply monitoring.

## Common Issues

### Can't Access Service via Domain

**Check DNS:**
```bash
dig vault.yourdomain.com  # Should point to your server IP
```

**Check Traefik:**
```bash
docker compose logs proxy | grep vault
```

### SSL Certificate Error

Wait 1-2 minutes for Let's Encrypt to issue certificate. Check:
```bash
docker compose logs proxy | grep -i acme
```

### Container Won't Start

```bash
# Check logs
docker compose logs vaultwarden

# Check for port conflicts
sudo lsof -i :8080
```

## Resources

- **Full Documentation**: See `/docs` folder
  - `architecture.md` - System overview
  - `adding-services.md` - Detailed service guide
  - `troubleshooting.md` - Solutions to common problems

- **Task Help**:
```bash
deno task  # List all available tasks
```

- **Service Examples**: Check `servers/home/compose.yml` for working examples

## Quick Commands Reference

```bash
# Deploy to server
deno task deploy home

# SSH to server
deno task ssh home

# Run backup
deno task backup

# Restore backup
deno task restore

# Check containers
docker compose ps

# View logs
docker compose logs -f <service-name>

# Restart service
docker compose restart <service-name>

# Update all services
docker compose pull && docker compose up -d
```

## Getting Help

If stuck, check:
1. **Logs**: `docker compose logs <service>`
2. **Troubleshooting guide**: `docs/troubleshooting.md`
3. **Configuration**: `docker compose config`
4. **Service status**: `docker compose ps`

That's it! You now have a working homelab with automatic updates, SSL, and a framework for adding unlimited services. 🎉
