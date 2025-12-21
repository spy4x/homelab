# Traefik

Reverse proxy with automatic SSL via Let's Encrypt.

## Features

- HTTP/HTTPS routing via subdomains
- Automatic [Let's Encrypt](https://letsencrypt.org/) SSL certificates
- [Docker provider](https://doc.traefik.io/traefik/providers/docker/) for service discovery
- Dashboard for monitoring routes

## Configuration

Services expose themselves via Docker labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.myservice.rule=Host(`myservice.${DOMAIN}`)"
  - "traefik.http.routers.myservice.entrypoints=websecure"
  - "traefik.http.routers.myservice.tls.certresolver=myresolver"
```

## Environment Variables

```bash
DOMAIN=yourdomain.com           # Base domain
ACME_EMAIL=you@email.com        # Let's Encrypt email
BASIC_AUTH_USER=admin           # Dashboard auth
BASIC_AUTH_PASSWORD=...         # Generated via: openssl passwd -apr1
```

## Access

- Dashboard: `https://proxy.${DOMAIN}`
- Requires basic auth (BASIC_AUTH_USER/PASSWORD)

## Middleware

Add [middlewares](https://doc.traefik.io/traefik/middlewares/http/overview/) for authentication, rate limiting, etc:

```yaml
labels:
  - "traefik.http.routers.myservice.middlewares=auth"
  - "traefik.http.middlewares.auth.basicauth.users=${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}"
```

## Resources

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Router Configuration](https://doc.traefik.io/traefik/routing/routers/)
- [TLS Configuration](https://doc.traefik.io/traefik/https/acme/)
