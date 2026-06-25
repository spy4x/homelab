# Auth Infrastructure Plan — Authelia Deepening

Current state: Authentik → Authelia migrated. Forward-auth working for
transmission, akaunting, monica. TOTP configured (CLI). SMTP notifier
pending. ~15 stacks still use basic auth (`auth` middleware).

This plan covers three phases:

1. **Forward-auth all the things** — replace basic auth everywhere
2. **2FA for admin** — enforce `two_factor` policy on management UIs
3. **OIDC SSO** — configure Authelia as OIDC provider, eliminate
   separate passwords for apps that support it

---

## Architecture

```
                          ┌──────────────────────────┐
                          │    Authelia (OIDC + FA)   │
                          │  auth.antonshubin.com:9091 │
                          └──────────┬───────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │  forward-auth        │ OIDC (redirect)      │
              ▼                      ▼                       ▼
┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ Services w/o OIDC   │  │ Services w/ OIDC      │  │ Public services       │
│ (transmission, etc) │  │ (grafana, gitea, etc) │  │ (antonshubin.com)     │
│ authelia@file       │  │ Login with Authelia   │  │ bypass                │
└─────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

Two auth methods coexist:

- **Forward-auth** — no app changes, works with everything
- **OIDC** — proper SSO, requires app support, enables group-based
  permissions, passwordless login

---

## Phase 1 — Forward-Auth Everything

Replace `auth` (Traefik basic auth) with `authelia@file` in every stack.
This eliminates the shared `BASIC_AUTH_PASSWORD` — one password for all.

### Affected stacks

Each needs: `middlewares=auth,robots-deny@file` → `middlewares=authelia@file,robots-deny@file`

| Stack            | Service      | Domain               | Notes                                  |
| ---------------- | ------------ | -------------------- | -------------------------------------- |
| metube           | MeTube       | metube.${DOMAIN}     | No own auth                            |
| it-tools         | IT-Tools     | it-tools.${DOMAIN}   | No own auth                            |
| ollama           | Ollama       | ollama.${DOMAIN}     | No own auth                            |
| traggo           | Traggo       | time.${DOMAIN}       | Has own auth (weak)                    |
| stirling-pdf     | Stirling-PDF | tools.${DOMAIN}      | Has own auth                           |
| grafana          | Grafana      | metrics.${DOMAIN}    | Has own auth, can switch to OIDC later |
| victoria-metrics | Grafana VM   | metrics-vm.${DOMAIN} | Same as grafana                        |
| mailserver       | Rspamd       | rspamd.${DOMAIN}     | No own web auth                        |
| traefik          | Traefik dash | proxy-home.${DOMAIN} | Admin panel, 2FA target                |
| openhands        | OpenHands    | code.${DOMAIN}       | Has API key auth                       |

### Stacks with complex middleware chains

These need careful editing — don't drop existing middlewares:

```yaml
# openhands currently:
middlewares=auth,openhands-session-key,robots-deny@file
# becomes:
middlewares=authelia@file,openhands-session-key,robots-deny@file

# traefik currently (middleware defined inline, not @file):
# Line 74: traefik.http.routers.hl-traefik.middlewares=auth
# Need to switch from inline basic auth to authelia@file

# grafana currently:
middlewares=auth,robots-deny@file
# becomes:
middlewares=authelia@file,robots-deny@file
```

### Add all to access_control rules

In `servers/home/configs/authelia/configuration.yml`:

```yaml
access_control:
  default_policy: deny
  rules:
    # Public — bypass
    - domain: "antonshubin.com"
      policy: bypass
    - domain: "auth.antonshubin.com"
      policy: bypass
    - domain: "neatsoft.dev"
      policy: bypass
    - domain: "www.neatsoft.dev"
      policy: bypass

    # one_factor — general services
    - domain: "torrents.antonshubin.com"
      policy: one_factor
    - domain: "invoices.antonshubin.com"
      policy: one_factor
    - domain: "monica.antonshubin.com"
      policy: one_factor
    - domain: "crm.antonshubin.com"
      policy: one_factor
    - domain: "sage.antonshubin.com"
      policy: one_factor
    - domain: "metube.antonshubin.com"
      policy: one_factor
    - domain: "it-tools.antonshubin.com"
      policy: one_factor
    - domain: "ollama.antonshubin.com"
      policy: one_factor
    - domain: "time.antonshubin.com"
      policy: one_factor
    - domain: "tools.antonshubin.com"
      policy: one_factor
    - domain: "rspamd.antonshubin.com"
      policy: one_factor
    - domain: "code.antonshubin.com"
      policy: one_factor

    # two_factor — admin / sensitive
    - domain: "metrics.antonshubin.com"
      policy: two_factor
    - domain: "metrics-vm.antonshubin.com"
      policy: two_factor
    - domain: "proxy-home.antonshubin.com"
      policy: two_factor
```

### Execution order

```bash
# 1. Update access_control in configuration.yml first
# 2. Deploy authelia (reloads config)
deno task deploy home authelia

# 3. Switch stacks one by one, verify each works
deno task deploy home metube
deno task deploy home it-tools
deno task deploy home ollama
deno task deploy home traggo
deno task deploy home stirling-pdf
deno task deploy home mailserver        # rspamd
deno task deploy home grafana
deno task deploy home victoria-metrics
deno task deploy home openhands
deno task deploy home traefik
```

After each: visit the domain, confirm redirect to Authelia login,
log in, confirm access.

---

## Phase 2 — 2FA Enforcement

Currently TOTP is stored but `one_factor` services never prompt for it.
`two_factor` policy forces 2FA on every login.

### Target services for 2FA

These control infrastructure or personal data:

| Domain               | Service           | Reason                         |
| -------------------- | ----------------- | ------------------------------ |
| proxy-home.${DOMAIN} | Traefik dashboard | Reverse proxy control          |
| metrics.${DOMAIN}    | Grafana           | Infra monitoring               |
| metrics-vm.${DOMAIN} | Grafana VM        | Infra monitoring               |
| git.${DOMAIN}        | Gitea             | Code, CI/CD secrets            |
| code.${DOMAIN}       | OpenHands         | AI has filesystem access       |
| ci.${DOMAIN}         | Woodpecker        | CI/CD pipeline control         |
| passwords.${DOMAIN}  | Vaultwarden       | Password manager (has own 2FA) |
| photos.${DOMAIN}     | Immich            | Personal photos                |

**Note:** Vaultwarden and Immich have their own strong auth (master
password + 2FA). Adding Authelia in front is redundant and may break
mobile apps. Keep bypass for these unless OIDC is configured.

### Access control after Phase 2

```yaml
access_control:
  default_policy: deny
  rules:
    # Public — bypass
    - domain: "antonshubin.com"
      policy: bypass
    - domain: "auth.antonshubin.com"
      policy: bypass
    - domain: "neatsoft.dev"
      policy: bypass
    - domain: "www.neatsoft.dev"
      policy: bypass

    # Apps with own strong auth — bypass (no double auth)
    - domain: "passwords.antonshubin.com"
      policy: bypass
    - domain: "photos.antonshubin.com"
      policy: bypass

    # one_factor — general services
    - domain: "torrents.antonshubin.com"
      policy: one_factor
    - domain: "invoices.antonshubin.com"
      policy: one_factor
    - domain: "monica.antonshubin.com"
      policy: one_factor
    - domain: "crm.antonshubin.com"
      policy: one_factor
    - domain: "sage.antonshubin.com"
      policy: one_factor
    - domain: "metube.antonshubin.com"
      policy: one_factor
    - domain: "it-tools.antonshubin.com"
      policy: one_factor
    - domain: "ollama.antonshubin.com"
      policy: one_factor
    - domain: "time.antonshubin.com"
      policy: one_factor
    - domain: "tools.antonshubin.com"
      policy: one_factor
    - domain: "rspamd.antonshubin.com"
      policy: one_factor
    - domain: "code.antonshubin.com"
      policy: one_factor

    # two_factor — admin / sensitive
    - domain: "metrics.antonshubin.com"
      policy: two_factor
    - domain: "metrics-vm.antonshubin.com"
      policy: two_factor
    - domain: "proxy-home.antonshubin.com"
      policy: two_factor
    - domain: "git.antonshubin.com"
      policy: two_factor
    - domain: "ci.antonshubin.com"
      policy: two_factor
```

### OIDC alternative for 2FA

Once OIDC is configured for gitea, woodpecker, grafana — they get
Authelia's 2FA natively via the OIDC flow. Their forward-auth
middleware can be removed, and access_control for those domains
can be set to `bypass` (since OIDC handles auth internally).

---

## Phase 3 — OIDC SSO

### Enable OIDC in Authelia

In `configuration.yml`:

```yaml
identity_providers:
  oidc:
    hmac_secret: ${AUTHELIA_OIDC_HMAC_SECRET}
    issuer_private_key: |
      -----BEGIN RSA PRIVATE KEY-----
      ...
      -----END RSA PRIVATE KEY-----
    access_token_lifespan: 1h
    authorize_code_lifespan: 1m
    id_token_lifespan: 1h
    refresh_token_lifespan: 90d
    cors:
      endpoints:
        - authorization
        - token
        - revocation
        - end_session
      allowed_origins:
        - https://*.antonshubin.com
    clients:
      # Grafana
      - client_id: grafana
        client_name: Grafana
        client_secret: ${AUTHELIA_OIDC_CLIENT_SECRET_GRAFANA}
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://metrics.antonshubin.com/login/generic_oauth
        scopes:
          - openid
          - profile
          - email
          - groups
        userinfo_signed_response_alg: none

      # Gitea
      - client_id: gitea
        client_name: Gitea
        client_secret: ${AUTHELIA_OIDC_CLIENT_SECRET_GITEA}
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://git.antonshubin.com/user/oauth2/authelia/callback
        scopes:
          - openid
          - profile
          - email
          - groups

      # Woodpecker
      - client_id: woodpecker
        client_name: Woodpecker CI
        client_secret: ${AUTHELIA_OIDC_CLIENT_SECRET_WOODPECKER}
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://ci.antonshubin.com/authorize
        scopes:
          - openid
          - profile
          - email

      # Open WebUI
      - client_id: open-webui
        client_name: Open WebUI
        client_secret: ${AUTHELIA_OIDC_CLIENT_SECRET_OPENWEBUI}
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://ai.antonshubin.com/oauth/authelia/callback
        scopes:
          - openid
          - profile
          - email
          - groups

      # Paperless-ngx
      - client_id: paperless
        client_name: Paperless-ngx
        client_secret: ${AUTHELIA_OIDC_CLIENT_SECRET_PAPERLESS}
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://docs.antonshubin.com/accounts/authelia/login/callback/
        scopes:
          - openid
          - profile
          - email
```

### Generate OIDC secrets

```bash
# One HMAC secret for Authelia (stay fixed, never change)
openssl rand -hex 32

# Per-client secrets
openssl rand -base64 32
```

### Add env vars to `.env` + `.env.example`

```bash
#region Authelia OIDC
AUTHELIA_OIDC_HMAC_SECRET=REPLACE_WITH_64_CHAR_HEX
AUTHELIA_OIDC_CLIENT_SECRET_GRAFANA=REPLACE_WITH_BASE64
AUTHELIA_OIDC_CLIENT_SECRET_GITEA=REPLACE_WITH_BASE64
AUTHELIA_OIDC_CLIENT_SECRET_WOODPECKER=REPLACE_WITH_BASE64
AUTHELIA_OIDC_CLIENT_SECRET_OPENWEBUI=REPLACE_WITH_BASE64
AUTHELIA_OIDC_CLIENT_SECRET_PAPERLESS=REPLACE_WITH_BASE64
#endregion
```

### Generate RSA key for OIDC token signing

```bash
openssl genrsa -out /dev/stdout 2048
# Copy the whole output (incl ---BEGIN/END---) into configuration.yml
# as issuer_private_key
```

### Configure each app for OIDC

**Grafana** (`stacks/grafana/compose.yml`):

```yaml
- GF_AUTH_GENERIC_OAUTH_ENABLED=true
- GF_AUTH_GENERIC_OAUTH_NAME=Authelia
- GF_AUTH_GENERIC_OAUTH_CLIENT_ID=grafana
- GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET=${AUTHELIA_OIDC_CLIENT_SECRET_GRAFANA}
- GF_AUTH_GENERIC_OAUTH_SCOPES=openid profile email groups
- GF_AUTH_GENERIC_OAUTH_AUTH_URL=https://auth.antonshubin.com/api/oidc/authorization
- GF_AUTH_GENERIC_OAUTH_TOKEN_URL=https://auth.antonshubin.com/api/oidc/token
- GF_AUTH_GENERIC_OAUTH_API_URL=https://auth.antonshubin.com/api/oidc/userinfo
- GF_AUTH_GENERIC_OAUTH_ALLOW_ASSIGN_GRAFANA_ADMIN=true
- GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH=groups
- GF_AUTH_SIGNOUT_REDIRECT_URL=https://auth.antonshubin.com/logout
```

**Gitea** (`stacks/gitea/compose.yml`):

```yaml
# Add OAuth2 provider via Gitea UI:
# Settings → Authentication Sources → Add OAuth2
# OAuth2 Provider: OpenID Connect
# Client ID: gitea
# Client Secret: ${AUTHELIA_OIDC_CLIENT_SECRET_GITEA}
# OpenID Connect Auto Discovery URL: https://auth.antonshubin.com/.well-known/openid-configuration
```

**Woodpecker** (`stacks/woodpecker/compose.yml`):

```yaml
- WOODPECKER_OPENID_CONNECT_ENABLED=true
- WOODPECKER_OPENID_CONNECT_CLIENT_ID=woodpecker
- WOODPECKER_OPENID_CONNECT_CLIENT_SECRET=${AUTHELIA_OIDC_CLIENT_SECRET_WOODPECKER}
- WOODPECKER_OPENID_CONNECT_PROVIDER=https://auth.antonshubin.com
```

**Open WebUI** (`stacks/open-webui/compose.yml`):

```yaml
- OAUTH_CLIENT_ID=open-webui
- OAUTH_CLIENT_SECRET=${AUTHELIA_OIDC_CLIENT_SECRET_OPENWEBUI}
- OAUTH_PROVIDER_NAME=Authelia
- OPENID_PROVIDER_URL=https://auth.antonshubin.com/.well-known/openid-configuration
- OAUTH_SCOPES=openid profile email groups
```

**Paperless-ngx** (`stacks/paperless-ngx/compose.yml`):

```yaml
# Via Social Account / OIDC config in paperless settings
# Add in PAPERLESS_* env or via admin UI
# Provider: Authelia
# Client ID: paperless
# Client Secret: ${AUTHELIA_OIDC_CLIENT_SECRET_PAPERLESS}
# OIDC Config URL: https://auth.antonshubin.com/.well-known/openid-configuration
```

### Post-OIDC cleanup

Once OIDC is working for an app:

1. Remove its `authelia@file` from Traefik middlewares
2. Set its domain to `policy: bypass` in access_control
3. The app's own OIDC flow handles auth + 2FA

Reason: double auth (forward-auth + OIDC) breaks callback URLs.
OIDC needs direct access to its callback endpoint without Traefik
intercepting.

---

## SMTP Notifier

Currently using filesystem notifier (`/data/notifications.yml`).
For identity verification emails to arrive in inbox:

```yaml
notifier:
  smtp:
    address: smtp://mail.antonshubin.com:587
    username: noreply@antonshubin.com
    password: ${SMTP_PASSWORD}
    sender: Authelia <noreply@antonshubin.com>
```

**Known issue:** Authelia v4.39 fails to resolve `${SMTP_PASSWORD}` if
the env var is a plain string. Workaround: bake the values directly
into the YAML config (since it's encrypted in `.env.age` anyway).

---

## Env Vars Checklist

Add to `.env` + `.env.example` (`#region Authelia`):

```bash
AUTHELIA_SESSION_SECRET=<hex>
AUTHELIA_OIDC_HMAC_SECRET=<hex>
AUTHELIA_OIDC_CLIENT_SECRET_GRAFANA=<base64>
AUTHELIA_OIDC_CLIENT_SECRET_GITEA=<base64>
AUTHELIA_OIDC_CLIENT_SECRET_WOODPECKER=<base64>
AUTHELIA_OIDC_CLIENT_SECRET_OPENWEBUI=<base64>
AUTHELIA_OIDC_CLIENT_SECRET_PAPERLESS=<base64>
```

Pass to authelia container in `stacks/authelia/compose.yml`:

```yaml
environment:
  - TZ=${TIMEZONE}
  - AUTHELIA_SESSION_SECRET=${AUTHELIA_SESSION_SECRET}
  - AUTHELIA_OIDC_HMAC_SECRET=${AUTHELIA_OIDC_HMAC_SECRET}
```

(The client secrets are used by the apps, not by authelia directly.)

---

## Gatus Monitoring Updates

Services behind Authelia return 302 (redirect to login) instead of
200. Update conditions in `servers/cloud/configs/gatus.yml`:

```yaml
conditions:
  - "[STATUS] == 200 || [STATUS] == 302"
```

Already done for transmission, monica, akaunting. Apply to all
authelia-protected services.

---

## Order of Execution (recommended)

```
Phase 1a: SMTP notifier + identity verification to email
Phase 1b: Switch basic auth → authelia@file for all stacks
Phase 1c: Update gatus conditions, verify all work
Phase 2:   Enable two_factor for admin services
Phase 3a:  Generate OIDC keys + configure Authelia
Phase 3b:  Configure each app for OIDC (grafana first, then gitea, etc)
Phase 3c:  Remove forward-auth from OIDC apps, switch to bypass
```

Each phase can be done independently. Phase 1 has the highest
security ROI (eliminates shared basic auth password).
