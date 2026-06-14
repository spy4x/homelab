# Homelab — Status & Roadmap

Last session: 2026-06-13/14
Author: Anton Shubin (spy4x)
Repo: github.com/spy4x/homelab

---

## What We Built This Session

### Infrastructure Changes
- **`hl-` prefix** on ALL containers, Traefik routers, and services (avoids conflicts with `fn-*` financy and `th-*` theonlyone projects on same Docker host)
- **AGENTS.md** updated with: IaC priority, hl- prefix convention, auth protection guidelines, .env encryption rules
- **Backup system** fixed: uses `docker compose` for compose-managed stacks (not individual container names), stateless stack backups removed

### New Stacks Deployed (home server — 40 total)
All on antonshubin.com. Default auth: `middlewares=auth` (Traefik basic auth) unless noted.

| Stack | URL | Notes |
|-------|-----|-------|
| Monica CRM | crm. | Basic auth |
| Mirotalk | talk. | No auth (P2P rooms) |
| Reitti | loc. | Transit, no auth, needs postgis/redis/tile-cache |
| it-tools | it-tools. | Basic auth |
| Stirling PDF | tools. | **Basic auth** (internal security disabled) |
| Usememos | notes. | Own auth (register on first visit) |
| Ollama | ollama. | GPU passthrough, gemma4:e4b loaded |
| Grafana | metrics. | see .env |
| Akaunting | invoices. | Basic auth |
| Gitea | git. | Own auth, registration OFF, captcha ON |
| Traggo | time. | Basic auth, `admin`/`admin` default |
| Stalwart | stalwart. | Bootstrap mode, `admin` / password in .env, UI at `/admin` |
| Paperless-ngx | docs. | Own auth |
| Docker Registry | registry. | Basic auth, web UI via joxit/docker-registry-ui |
| Authentik | auth. | SSO provider, see .env |
| Plausible | analytics. | Community fav analytics, ~1GB (ClickHouse) |
| Umami | stats. | Lightweight analytics, PostgreSQL, see .env |
| Monitoring | internal | Loki + Promtail + Prometheus + Node Exporter + cAdvisor |
| Cal.diy | schedule. | **Public** (no auth) — second router for schedule. domain |

### Auth Layer (Authentik)
- Deployed at `auth.antonshubin.com` (working ✅)
- Traefik forward-auth middleware `authentik@file` added to `stacks/traefik/dynamic.yml`
- Blueprint created at `servers/home/configs/authentik/blueprints/homelab-apps.yaml`
- **NOT YET INTEGRATED** with any service — needs admin UI setup first

### Monitoring & Dashboard
- **Gatus**: 42 endpoints on `uptime-cloud.antonshubin.com` watching all home services
- **dash.antonshubin.com**: all services listed with Gatus health badges
- **Grafana**: Prometheus + Loki datasources, Node Exporter + cAdvisor dashboards (provisioned as code)

### Fixes Applied
- Mailserver cert: cron fixed, ansible volumes_path added
- Monica: port 8080→80 (Apache uses 80)
- Reitti: added postgis/redis/tile-cache deps, memory 256M→1G, start_period 90s
- Stirling-PDF: OOM 1G→2G, security off + basic auth
- Plausible: SECRET_KEY_BASE 32→64 bytes, ClickHouse auth + OOM fix (768M)
- Umami: SQLite→PostgreSQL (v3 dropped SQLite), OOM 128M→512M
- Authentik: password was UNUSABLE_PASSWORD in DB, reset to proper hash
- Traefik: permissionsPolicy allows camera/mic/clipboard globally for all services

---

## What's NOT Finished

### 1. Authentik SSO Integration (HIGHEST PRIORITY)
The forward-auth middleware and blueprints are ready. To activate:
```bash
# 1. Visit https://auth.antonshubin.com — login as akadmin / AdminPass2026!
# 2. Admin → Outposts → Create → type "Proxy" → select the apps
# 3. Admin → Blueprints → Import → paste blueprint from:
#    servers/home/configs/authentik/blueprints/homelab-apps.yaml
# 4. Get the outpost token
# 5. Switch services from basic auth to authentik:
#    - Change stacks/sage (external) labels to use middlewares=authentik@file
#    - Change stacks/akaunting/compose.yml: middlewares=auth → middlewares=authentik@file
#    - Repeat for transmission, metube, monica, ollama, it-tools, grafana, traggo
```

### 2. Gitea Mirror
- GitHub repo mirroring not configured
- User had 6500+ fake registrations on previous attempt — mitigated with registration=OFF, captcha=ON
- To set up mirror: Admin → Repositories → Migrate → add GitHub token

### 3. VaultWarden Cleanup
- `INVITATIONS_ALLOWED=true` still set on server (from Marina password reset)
- After Marina signs up, revert:
```bash
ssh home
sed -i 's/VAULTWARDEN_INVITATIONS_ALLOWED=true/VAULTWARDEN_INVITATIONS_ALLOWED=false/' ~/ssd-2tb/apps/anton/home/.env
cd ~/ssd-2tb/apps/anton/home && docker compose -f stacks/vaultwarden/compose.yml up -d
```

### 4. Reitti Container Cleanup
- Reitti's dependency containers (postgis, redis, tile-cache) don't have `hl-` prefix
- They use docker-compose auto-generated names (`reitti-postgis-1`, etc.)
- To fix: add `container_name:` to those services in `stacks/reitti/compose.yml`

---

## Future Plans (Next Session Ideas)

### Auth Layer Expansion
- Integrate Authentik with all services currently using basic auth
- Add hardware key (WebAuthn/FIDO2) 2FA
- Set up OIDC for Gitea, Grafana, Vaultwarden

### Analytics
- Add tracking snippet to antonshubin.com website
- Plausible: admin already registered (anton@antonshubin.com), needs site creation
- Umami: see .env, needs first website tracked

### Monitoring Improvements
- Add Prometheus alerting rules
- Set up Grafana alerting (email/ntfy)
- Add disk space monitoring

### New Stacks (User Ideas)
- Gitea mirror (GitHub → Gitea)
- Self-hosted CI/CD improvements (Woodpecker is deployed but needs pipeline setup)

### Paperless-ngx
- Needs initial setup at docs.antonshubin.com
- Document scanner/email integration

---

## Credentials Summary

| Service | URL | Login |
|---------|-----|-------|
| Authentik | auth.antonshubin.com | see .env |
| Grafana | metrics.antonshubin.com | see .env |
| Umami | stats.antonshubin.com | `admin` / `umami123!` |
| Stalwart | stalwart.antonshubin.com | `admin` / (in .env) — bootstrap mode |
| Traggo | time.antonshubin.com | see .env |
| Plausible | analytics.antonshubin.com | Created by user |
| Basic Auth | all services | `spy4x` / htpasswd from Traefik config |

---

## Key Repo Patterns

### Service Addition Checklist
1. `stacks/{name}/compose.yml` — container_name: hl-{name}, Traefik labels, resource limits
2. `stacks/{name}/backup.ts` — unless stateless
3. `servers/{server}/config.json` — add to stacks array
4. `servers/{server}/.env` + `.env.example` — add env vars
5. `servers/cloud/configs/gatus.yml` — add monitoring endpoint (home→cloud)
6. `servers/home/configs/dash/index.html.template` — add badge with health URL
7. **Auth**: `middlewares=auth` for basic auth, `middlewares=authentik@file` for SSO
8. Deploy: `deno task deploy <server>`

### Auth Decision
- **authentik@file** (SSO, preferred): Use after Authentik outpost is configured
- **auth** (basic auth): Fallback for services without own login
- **No middleware**: Services with own auth (Gitea, Vaultwarden, Paperless, Stirling-PDF) or public services (Reitti, Schedule, SearXNG)

### Environment Files
- **Never commit plaintext `.env`** — pre-commit hook encrypts to `.env.age`
- Always edit both `.env` (actual) and `.env.example` (placeholders)
- For re-encryption after manual edits: `deno task env:encrypt`
