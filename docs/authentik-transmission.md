# Authentik SSO on Transmission — quick verification

## What changed

- `servers/home/configs/authentik/blueprints/homelab-apps.yaml` — added a
  `Proxy Provider` + `Application` for Transmission. Mode is `forward_single`
  (Authentik terminates auth, then proxies the request with auth headers).
- `stacks/transmission/compose.yml` — Traefik label changed from
  `middlewares=auth` (Traefik basic auth) to `middlewares=authentik`
  (Authentik forward auth via `stacks/traefik/dynamic.yml`).
- Transmission's own basic auth stays in the container config as a
  defense-in-depth fallback for direct IP access.

## Deploy

```bash
# 1. Re-import the blueprint (Authentik auto-applies on startup from /blueprints/,
#    but a manual re-import forces an immediate sync).
ssh home "docker restart hl-authentik"
# 2. Apply the new Traefik labels
deno task deploy home transmission
```

## Verify

```bash
# 1. Blueprint applied — check that provider-transmission + app-transmission exist
ssh home "docker exec hl-authentik ak shell -c 'from authentik.providers.proxy.models import ProxyProvider; print(list(ProxyProvider.objects.values_list(\"name\", flat=True)))'"
# Should include: ['Sage', 'Invoices', 'Transmission']

# 2. Embedded outpost is reachable
curl -I https://torrents.${DOMAIN}
# Expect: 302 redirect to https://auth.${DOMAIN}/application/oauth/authorize/...

# 3. After Authentik login, request succeeds
# (browser test) → https://torrents.${DOMAIN} → login → land on Transmission UI
```

## Roll back

If something breaks, revert the label in `stacks/transmission/compose.yml`:

```yaml
- "traefik.http.routers.hl-transmission.middlewares=auth"
```

## Next steps (after this works)

Once verified on Transmission, add Authentik SSO to other services by:

1. Adding Proxy Provider + Application to the blueprint
2. Changing the Traefik label from `auth` to `authentik`
3. Restarting the service

Candidate services (in order of priority):
- Gitea (already has its own auth — needs OIDC integration instead)
- Vaultwarden (own auth — OIDC integration)
- Paperless-ngx (own auth — OIDC integration)
- Stirling-PDF (basic auth — easy to swap)
- Monica (own auth — OIDC integration)
- Dash (nginx static, currently unprotected)

Note: services with their own user database should use OIDC, not forward auth.
Forward auth only works when the upstream app can be transparently gated.
