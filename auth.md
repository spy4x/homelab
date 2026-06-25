# Authentik → Authelia Migration Plan

## Why

Authentik 2025.2 blueprint system is broken (`!PythonObject` deprecated, `!Find` incompatible with flow references, `identifiers` silently dropped). The only working IaC path requires direct DB manipulation (Django ORM / SQL), which is not reproducible. Authelia is 100% config-driven — one YAML file defines everything.

## Architecture

```
                    ┌──────────────┐
User ──► Traefik ──►│ Authelia     │
         forward    │ (forward     │
         auth ─────►│  auth)       │
                    │              │
                    │ SQLite       │
                    │ (no Postgres)│
                    └──────────────┘

Stacks: hl-authelia (one container)
Deps:   redis:7-alpine (session storage, optional — can use memory/filesystem)
        authelia:latest
```

### Resource comparison

|         | Authentik (4 containers)                     | Authelia (2 containers) |
| ------- | -------------------------------------------- | ----------------------- |
| Image   | authentik/server + worker + postgres + redis | authelia + redis        |
| RAM     | ~900MB total                                 | ~100MB total            |
| Volumes | media, custom-templates, blueprints, db      | config, db (SQLite)     |

## Files to create

### 1. `stacks/authelia/compose.yml`

```yaml
networks:
  proxy:
    external: true

services:
  authelia:
    container_name: hl-authelia
    image: authelia/authelia:latest
    volumes:
      - ${VOLUMES_PATH}/authelia/config:/config
    environment:
      - TZ=${TIMEZONE}
    restart: unless-stopped
    networks:
      - proxy
    labels:
      - "traefik.enable=false"
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.3"

  authelia-redis:
    container_name: hl-authelia-redis
    image: redis:7-alpine
    restart: unless-stopped
    networks:
      - default
    deploy:
      resources:
        limits:
          memory: 64M
          cpus: "0.1"
```

### 2. `servers/home/configs/authelia/configuration.yml`

```yaml
###############################################################
#                   Authelia configuration                    #
###############################################################
host: 0.0.0.0
port: 9091
log_level: info

# Session — stored in Redis (survives restarts)
session:
  name: authelia_session
  secret: ${AUTHELIA_SESSION_SECRET}
  expiration: 1h # idle
  inactivity: 5m # max inactivity
  remember_me: 1d
  redis:
    host: authelia-redis
    port: 6379

# Authentication backend — file-based (can add LDAP later)
authentication_backend:
  file:
    path: /config/users.yml

# Access Control Rules
access_control:
  default_policy: deny
  rules:
    # Public — no auth
    - domain: "antonshubin.com"
      policy: bypass
    - domain: "neatsoft.dev"
      policy: bypass
    - domain: "www.neatsoft.dev"
      policy: bypass

    # Services requiring authentication
    - domain: "torrents.antonshubin.com"
      policy: one_factor
    - domain: "invoices.antonshubin.com"
      policy: one_factor
    - domain: "sage.antonshubin.com"
      policy: one_factor
    - domain: "monica.antonshubin.com"
      policy: one_factor
    - domain: "crm.antonshubin.com"
      policy: one_factor
    # … add more as needed

    # Admin access — requires 2FA
    - domain: "grafana.antonshubin.com"
      policy: two_factor
    - domain: "metrics.antonshubin.com"
      policy: two_factor
    - domain: "portainer.antonshubin.com"
      policy: two_factor

  # More granular rules (e.g., allow specific paths without auth)
  # Can define per-resource rules here

# Two-factor authentication
totp:
  issuer: antonshubin.com
  period: 30
  skew: 1

webauthn:
  disable: false
  display_name: Authelia
  attestation_conveyance_preference: none
  user_verification: preferred

# Regulation — brute-force protection
regulation:
  max_retries: 5
  find_time: 2m
  ban_time: 5m

# Default redirection URLs
default_redirection_url: https://dash.antonshubin.com

# Notifications — for password reset, etc.
# Uses file system by default (writes to /config/notif/)
# Can add SMTP later if needed
notifier:
  filesystem:
    filename: /config/notifications.yml

# Theme
theme: dark
```

### 3. `servers/home/configs/authelia/users.yml`

```yaml
users:
  spy4x:
    displayname: "Anton Shubin"
    password: "$argon2id$v=19$m=65536,t=3,p=4$..." # generated with `authelia hash-password`
    email: anton@antonshubin.com
    groups:
      - admins
      - users
```

Password hash generation:

```bash
docker run authelia/authelia:latest authelia hash-password 'yT8uN4pR1sK6wE9bH2mX5vL7qC0jF3dA'
```

### 4. Update Traefik middleware (`stacks/traefik/dynamic.yml`)

Replace the existing `authentik` middleware:

```yaml
http:
  middlewares:
    # Remove this:
    # authentik:
    #   forwardAuth:
    #     address: http://hl-authentik:9000/outpost.goauthentik.io/auth/traefik

    # Add this:
    authelia:
      forwardAuth:
        address: http://hl-authelia:9091/api/verify?auth=send
        trustForwardHeader: true
        authResponseHeaders:
          Remote-User: Remote-User
          Remote-Groups: Remote-Groups
          Remote-Email: Remote-Email
          Remote-Name: Remote-Name
```

### 5. Update service labels

In each service's compose that uses Authentik, replace:

```yaml
# Old:
- "traefik.http.routers.hl-xxx.middlewares=authentik@file,robots-deny@file"

# New:
- "traefik.http.routers.hl-xxx.middlewares=authelia@file,robots-deny@file"
```

Affected stacks (current `authentik@file` users):

- transmission
- akaunting (invoices)
- monica
- (any others using authentik middleware)

## Migration steps

### Phase 1 — Deploy Authelia alongside Authentik

```bash
# 1. Add to servers/home/config.json
{ "name": "authelia" }

# 2. Create config files:
#    servers/home/configs/authelia/configuration.yml
#    servers/home/configs/authelia/users.yml

# 3. Generate password hash
# 4. Add AUTHELIA_SESSION_SECRET to servers/home/.env

# 5. Deploy
deno task deploy home authelia
```

### Phase 2 — Switch services one by one

```bash
# For each service, change middleware from authentik@file → authelia@file
# Then redeploy that service
deno task deploy home transmission
```

### Phase 3 — Remove Authentik

```bash
# After all services are switched:
# 1. Remove authentik from servers/home/config.json
# 2. Remove authentik@file middleware from dynamic.yml
# 3. Deploy home
deno task deploy home

# 4. Clean up volumes
ssh homelab "docker compose -f ... down -v"
```

### Rollback

```bash
# Switch middleware back to authentik@file
# Deploy
deno task deploy home
# Authentik is still running with existing DB
```

## Key differences to keep in mind

| Aspect     | Authentik                              | Authelia                                                          |
| ---------- | -------------------------------------- | ----------------------------------------------------------------- |
| Proxy mode | forward_single (traefik→authentik→app) | forward_auth (traefik→authelia→traefik→app)                       |
| Callback   | `/outpost.goauthentik.io/callback`     | `/authelia/callback`                                              |
| Login page | hosted on `auth.antonshubin.com`       | hosted on same domain (e.g., `torrents.antonshubin.com/authelia`) |
| Users      | created via Admin UI                   | defined in `users.yml`                                            |
| 2FA setup  | via user settings UI                   | first login triggers setup                                        |
| Session    | JWT in memory + cookies                | Redis + cookies                                                   |

## Config vars needed in `.env`

```bash
# Authelia
AUTHELIA_SESSION_SECRET=openssl rand -hex 32
# Session encryption/generation keys
# (generate once, never change without invalidating sessions)
```
