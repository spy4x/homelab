# OpenHands Agent Canvas — Docker (DECOMMISSIONED)

> **This Docker deployment is decommissioned.**
> OpenHands now runs as a standalone systemd user service on the homelab host.
> See `docs/openhands.md` for current deployment.

## Migration

The Docker container has been replaced by a systemd user service running as `spy4x`.
State migrated from Docker volume to `~/.openhands/`. All functionality preserved.

## Access

Web UI: `https://code.antonshubin.com` (Authelia-protected)
