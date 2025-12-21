# Stacks Architecture Refactoring - Execution Plan

**Date:** 21 December 2025  
**Status:** ✅ COMPLETED (21 December 2025)  

## Goal

Consolidate all service definitions into a unified `stacks/` directory, replacing the current split model (sharedStacks + localStacks) with a single source of truth. This creates a cleaner, more maintainable architecture where each service stack is self-contained.

---

## Architecture Transformation

### Before → After
```
sharedStacks/              →  stacks/          (renamed + enhanced)
servers/*/localStacks/     →  stacks/          (absorbed)
servers/*/compose.yml      →  stacks/          (broken into individual services)
```

---

## Target Structure

```
homelab/
├── stacks/                      # ALL services (catalog)
│   ├── gatus/
│   │   ├── compose.yml
│   │   ├── backup.ts
│   │   ├── README.md
│   │   └── configs/            # Default configs (optional)
│   ├── immich/
│   ├── adguard/
│   └── ...
├── servers/
│   ├── home/
│   │   ├── .env
│   │   ├── config.json         # [{name: "traefik"}, {name: "nginx", deployAs: "homepage", ...}, ...]
│   │   ├── configs/            # Server-specific config overrides
│   │   │   └── gatus.yml
│   │   └── configs/backup/     # Non-service backups only (sync folders)
│   │       ├── archive.backup.ts
│   │       └── essentials.backup.ts
│   ├── cloud/
│   └── offsite/
```

---

## Key Decisions

### Backup System
- **Location**: Service backups in `stacks/*/backup.ts`, non-service backups in `servers/*/configs/backup/`
- **Discovery**: Backup script loads from both locations
- **Format**: Keep TypeScript for flexibility
- **Server Context**: Use `SERVER_NAME` env var at runtime (e.g., `destName: \`gatus-${SERVER_NAME}\``)

### Configuration Files
- **Defaults**: Stacks include example configs in `stacks/*/configs/`
- **Overrides**: Servers override via `servers/*/configs/` and `.env` variables
- **Precedence**: Server overrides always win
- **Compose Syntax**: Use `${VAR:-./default/path}` pattern

### Pre-Deploy Scripts
- **Support**: All stacks can have optional `before.deploy.ts`
- **Discovery**: Deploy script checks each stack during deployment
- **Access**: Scripts receive `.env` path as argument
- **Homepage Special Case**: Becomes generic `nginx` stack; content generation moves to `servers/home/configs/homepage/before.deploy.ts`. `config.json` can have many entries with name `nginx` but must have different `deployAs` to distinguish the containers and config folders.

### Documentation
- **Service Docs**: Move to `stacks/*/README.md`
- **Framework Docs**: Remain in `docs/`
- **Server Docs**: Remain in `servers/*/docs/` (if any non-service-specific, like sync folders)
- **Index**: Add stack catalog to root README.md
- **Cross-References**: Link related services in each README

### Deploy Script
- **Copy Scope**: Entire stack directories (includes compose, backup, docs, scripts)
- **Config.json Key**: Rename `sharedStacks` → `stacks`
- **Config.json Format**: Array of objects with `name` and optional metadata
- **Whitelist**: `.env`, `configs/`, `stacks/` (no more `localStacks/` or `compose.yml`)

### Service Organization
- **All Services in Stacks**: Even server-specific ones (true catalog approach)
- **Versioning**: Single version per stack (simplicity over flexibility)
- **Dependencies**: Document in README.md (e.g., "requires Traefik proxy network")

---

## Execution Plan

### Strategy
Big Bang Migration - all changes at once. No backward compatibility. Test thoroughly, then deploy.

### Phases

#### Phase 1: Script Updates
- `scripts/deploy/+main.ts`
  - Rename `sharedStacks` → `stacks`
  - Remove `localStacks/` references
  - Update file copying to copy entire stack directories
  - Discover and execute `before.deploy.ts` from stacks
  - Handle config.json as array of objects with `name` field
  
- `scripts/backup/src/config.ts`
  - Load configs from `stacks/*/backup.ts` first
  - Then load from `servers/*/configs/backup/*.backup.ts`
  - Merge both sources (stack configs + server configs)
  
- `scripts/backup/+main.ts`
  - Verify path resolution works with new structure

#### Phase 2: Directory Restructuring
1. **Rename:** `sharedStacks/` → `stacks/`
2. **Move local stacks:**
   - `servers/home/localStacks/immich/` → `stacks/immich/`
   - `servers/home/localStacks/piped/` → `stacks/piped/`
   - `servers/home/localStacks/homepage/` → `stacks/nginx/` (rename)
3. **Extract from compose.yml:**
   - Parse `servers/home/compose.yml`
   - Create individual stack directories for each service
   - Move service definitions to `stacks/[service]/compose.yml`
4. **Move backup configs:**
   - Service-specific: `servers/*/configs/backup/[service].backup.ts` → `stacks/[service]/backup.ts`
   - Keep non-service: `servers/home/configs/backup/{archive,essentials}.backup.ts`
5. **Move documentation:**
   - `servers/home/docs/[service].md` → `stacks/[service]/README.md`
6. **Update config.json:**
   - All servers: `{"sharedStacks": [...]}` → `{"stacks": [{name: "..."}, ...]}`
7. **Delete obsolete:**
   - `servers/home/compose.yml`
   - `servers/*/localStacks/` directories

#### Phase 3: Testing
1. Test scripts locally (syntax, logic)
2. Deploy to `offsite` (smallest footprint)
3. Verify services start, backups work
4. Deploy to `cloud`
5. Deploy to `home` (most complex)
6. Full validation pass

#### Phase 4: Documentation
- `docs/architecture.md` - Reflect new structure
- `docs/adding-services.md` - Update instructions
- `docs/get-started-5min.md` - Update paths
- `README.md` - Add stack catalog/index
- `.github/copilot-instructions.md` - Update file locations
- Service-specific docs - Consolidate into stack READMEs

#### Phase 5: Cleanup
- Verify no broken references
- Remove temporary files
- Git commits by maintainer

---

## Special Cases

### Homepage → Nginx Stack
- Current: `servers/home/localStacks/homepage/` with `before.deploy.ts`
- Target: Generic `stacks/nginx/` stack
- Content generation: Move to `servers/home/configs/homepage/before.deploy.ts`
- Rationale: nginx is reusable, homepage content is server-specific

### Config.json Format Evolution
**Before:**
```json
{"sharedStacks": ["traefik", "gatus", "watchtower"]}
```

**After:**
```json
{
  "stacks": [
    {"name": "traefik"},
    {"name": "nginx", "deployAs": "homepage", "traefikRule": "Host(`dash.${DOMAIN}`)"},
    {"name": "gatus"}
  ]
}
```

### Backup Config Naming
- Stack backups: `stacks/[service]/backup.ts` (was `[service].backup.ts`)
- Simplifies discovery, reduces naming conflicts

---

## File Inventory

**Stacks to Create/Move:**
- 6 from `sharedStacks/` (gatus, ntfy, syncthing, traefik, watchtower, wireguard)
- 3 from `servers/home/localStacks/` (immich, piped, homepage→nginx)
- ~15+ from `servers/home/compose.yml` (adguard, audiobookshelf, filebrowser, freshrss, home-assistant, jellyfin, open-webui, radicale, transmission, vaultwarden, woodpecker, etc.)

**Backup Configs to Move:**
- home: 17 service configs → stacks (keep 2 sync folders)
- cloud: 6 service configs → stacks
- offsite: 3 service configs → stacks

**Scripts to Update:**
- `scripts/deploy/+main.ts`
- `scripts/backup/src/config.ts`
- `scripts/backup/+main.ts`
- `scripts/backup/README.md`

**Configs to Update:**
- `servers/home/config.json`
- `servers/cloud/config.json`
- `servers/offsite/config.json`

**Docs to Update:**
- `docs/architecture.md`
- `docs/adding-services.md`
- `docs/get-started-5min.md`
- `README.md`
- `.github/copilot-instructions.md`

---

## Completion Summary

**Status:** ✅ COMPLETED  
**Completion Date:** 21 December 2025

All phases of the refactoring have been successfully executed:

✅ **Phase 1: Script Updates** - Deploy and backup scripts updated to use new structure  
✅ **Phase 2: Directory Restructuring** - All stacks consolidated into `stacks/` directory  
✅ **Phase 3: Testing** - All servers migrated (home, cloud, offsite)  
✅ **Phase 4: Documentation** - All docs updated to reflect new architecture  
✅ **Phase 5: Cleanup** - Old references removed

**Key Achievements:**
- Eliminated `sharedStacks/` and `localStacks/` split
- Single source of truth for all services in `stacks/`
- Config.json migration to object-based format with `deployAs` support
- Backup system loading from both stack and server locations
- All documentation updated and consistent

**Last Updated:** 21 December 2025