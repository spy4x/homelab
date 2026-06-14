# Session Tasks - Final

## ✅ Completed (this massive session)

### Infrastructure

- [x] Mailserver cert fixed (extracted from Traefik, cron at 03:15)
- [x] Ansible after-deploy: volumes_path added to inventory
- [x] hl- prefix on ALL containers/routers to avoid fn-/th- conflicts
- [x] AGENTS.md: IaC priority, hl- prefix convention, auth protection guidelines, .env encrypt rule
- [x] Backup system: docker compose mode instead of container names, stateless backups removed

### Monitoring & Dashboard

- [x] Gatus: all 42 endpoints monitored cross-server (cloud watches home)
- [x] dash.antonshubin.com: all services listed with health badges
- [x] Grafana: datasources (Prometheus+Loki), Node Exporter + cAdvisor dashboards provisioned as code

### Stacks deployed (home - 40 total)

- [x] Monica CRM (crm.antonshubin.com)
- [x] Mirotalk (talk.antonshubin.com)
- [x] Reitti (loc.antonshubin.com)
- [x] it-tools (it-tools.antonshubin.com)
- [x] Stirling PDF (tools.antonshubin.com)
- [x] Usememos (notes.antonshubin.com)
- [x] Ollama (ollama.antonshubin.com) - GPU passthrough, gemma4:e4b
- [x] Grafana (metrics.antonshubin.com)
- [x] Akaunting (invoices.antonshubin.com)
- [x] Gitea (git.antonshubin.com) - anti-spam config (registration OFF, captcha ON)
- [x] Traggo (time.antonshubin.com) - formerly timetracker
- [x] Stalwart (stalwart.antonshubin.com)
- [x] Paperless-ngx (docs.antonshubin.com)
- [x] Authentik (auth.antonshubin.com)
- [x] Docker Registry (registry.antonshubin.com)
- [x] Monitoring stack (Loki, Promtail, Prometheus, Node Exporter, cAdvisor)
- [x] Plausible (analytics.antonshubin.com)
- [x] Umami (stats.antonshubin.com)
- [x] Cal.diy schedule route (schedule.antonshubin.com)

### Fixes

- [x] Monica bad gateway: port 8080->80
- [x] Grafana router conflict with th-grafana: renamed to hl-grafana
- [x] Stirling-PDF OOM: increased memory 1G->2G, then 2G->2G
- [x] Reitti unhealthy: added postgis/redis/tile-cache deps, increased memory, start_period
- [x] Mirotalk camera/mic blocked: updated Traefik permissionsPolicy globally
- [x] Traefik dynamic.yml permissionsPolicy allowed camera, microphone, clipboard globally
- [x] Umami: SQLite->PostgreSQL (v3 dropped SQLite), OOM 128M->512M, password reset
- [x] Plausible: SECRET_KEY_BASE 32->64 bytes, ClickHouse auth, OOM 512M->768M
- [x] Authentik: password reset (was UNUSABLE_PASSWORD in DB)
- [x] mon- prefix removed from monitoring containers
- [x] Dashboard badge URLs unified with Gatus endpoint names

## ⏳ Still pending (new session)

### Authentik SSO integration

- [ ] **Complete Authentik setup in Admin UI**: Create outpost, link applications, get token
- [ ] Switch sage + invoices from basic auth to authentik forward-auth
- [ ] Protect other services (transmission, metube, monica, akaunting, etc.)
- Steps:
  1. Visit https://auth.antonshubin.com (see .env for password)
  2. Admin -> Outposts -> Create proxy type
  3. Admin -> Applications -> Create for Sage, Invoices
  4. Import blueprint at servers/home/configs/authentik/blueprints/homelab-apps.yaml
  5. Add `middlewares=authentik@file` to sage + akaunting compose labels

### Minor follow-ups

- [ ] Gitea mirror: configure GitHub repo mirroring
- [ ] VaultWarden: set INVITATIONS_ALLOWED=false after Marina signs up
- [ ] Reitti tile-cache containers cleanup (reitti-postgis-1 etc. don't have hl- prefix)
