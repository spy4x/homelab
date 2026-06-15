# AGENTS.md - Development Guidelines for Agentic Coding

This file contains guidelines for agentic coding agents (including AI assistants) working in this homelab infrastructure repository.

## 📝 Commit Convention (Angular-adapted)

```
<type>(<scope>): <short summary>
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `perf`, `ci`

**Scope:** stack name, server name, or area (e.g. `gatus`, `backup`, `deploy`). Omit if change is broad.

**Summary:** lowercase, no period, imperative mood (e.g. "add", "drop", "fix", "move").

Examples:

```
feat(immich): add hardware transcoding
fix(gatus): correct Healthchecks endpoint URL
refactor: drop freshrss, roundcube stacks
chore(deps): bump traefik to v3.3
```

## 🚀 Quick Start Commands

### Essential Development Commands

```bash
# Run all checks (lint, format, type-check, tests)
deno task check

# Auto-fix all issues
deno task fix

# Individual commands
deno task lint:check     # Check linting issues
deno task lint:fix       # Auto-fix linting issues
deno task fmt:check      # Check formatting
deno task fmt:fix        # Auto-format code
deno task ts:check       # Type-check TypeScript
deno task test           # Run tests
```

### Running Single Tests

```bash
deno test path/to/specific.test.ts     # Run single test file
deno test --watch path/to/test.ts       # Watch mode
```

### Infrastructure Commands

```bash
deno task deploy <server>     # Deploy all services to server
deno task deploy <server> <stack>  # Deploy single stack (e.g. `deno task deploy home plausible`)
deno task ansible <playbook>  # Run Ansible playbooks
deno task backup              # Run backup system
deno task ssh <server>        # SSH into server
```

## 📋 Code Style Guidelines

### TypeScript Formatting (from deno.jsonc)

- **Indentation**: 2 spaces (no tabs)
- **Line width**: 100 characters
- **Quotes**: Double quotes only
- **Semicolons**: Omitted (no semicolons)
- **Prose wrap**: Preserve

### Import Patterns

```typescript
// Use relative imports for local modules
import { BackupConfig } from "./+lib.ts"
import { error, success } from "./+lib.ts"

// Use JSR modules for standard library
import { getEnvVar } from "@std/dotenv"

// Use alias imports for shared scripts
import { BackupConfig } from "@scripts/backup"
```

### Naming Convention: `hl-` Prefix

To avoid conflicts with other projects running on the same Docker host (e.g., `fn-*`, `th-*`), **all homelab containers and Traefik router/service names must use the `hl-` prefix**:

```yaml
# Good
container_name: hl-monica
traefik.http.routers.hl-monica.rule=Host(`crm.${DOMAIN}`)
traefik.http.services.hl-monica.loadbalancer.server.port=80

# Bad (risk of conflict with other projects)
container_name: monica
traefik.http.routers.monica.rule=Host(`crm.${DOMAIN}`)
```

This applies to ALL compose.yml files in `stacks/`. Middleware names (e.g., `auth`) do NOT get the prefix since they're shared definitions on the Traefik container.

### File Naming Conventions

- **TypeScript files**: `kebab-case.ts` (e.g., `backup-config.ts`)
- **Main entry files**: `+main.ts` (Deno convention)
- **Library files**: `+lib.ts` (Deno convention)
- **Config files**: `config.json`, `compose.yml`
- **Backup configs**: `{service-name}.backup.ts`

### Type Definitions

```typescript
// Use interfaces for object shapes
export interface BackupContext {
  serverName: string
  backupsOutputBasePath: string
  // Optional properties with ?
  healthchecksUrl?: string
}

// Use enums for constants
export enum BackupStatus {
  IN_PROGRESS = 1,
  SUCCESS = 2,
  ERROR = 3,
}

// Use type for complex shapes
export type BackupConfigState = BackupConfig & {
  fileName: string
  status: BackupStatus
  error?: string
}
```

### Function Patterns

```typescript
// Export named functions with clear names
export function success(...args: unknown[]) {
  console.log(`%c${new Date().toISOString()} ${args.join(" ")}`, "color: green; font-weight: bold")
}

// Use async/await for async operations
export async function runCommand(
  cmd: string[],
  options?: { sudo?: boolean; cwd?: string },
): Promise<{ success: boolean; output: string; error: string }> {
  // Implementation
}

// Default exports for config objects
const backupConfig: BackupConfig = {
  name: "vaultwarden",
  sourcePaths: "default",
}
export default backupConfig
```

## 🛠️ Environment Variable Management

### Encryption Setup (Required)

**Before working with .env files, you MUST set up encryption:**

1. **Install dependencies** (requires sudo on Linux):
   ```bash
   # macOS
   brew install sops age

   # Linux 
   sudo apt install sops age    # Debian/Ubuntu
   sudo dnf install sops age    # Fedora/RHEL
   ```

2. **Initialize encryption**:
   ```bash
   deno task encrypt:root:init          # For root .env.root
   deno task encrypt:init <server-name> # For each server
   ```

3. **Install git hooks for automation**:
   ```bash
   deno task hooks:install              # Auto encrypt/decrypt on git ops
   ```

### Working with Environment Files

**CRITICAL: Always add environment variables to BOTH files:**

1. **`servers/{name}/.env`** - Actual values (encrypted to .env.age)
2. **`servers/{name}/.env.example`** - Placeholders (committed)

**ALWAYS encrypt .env files before committing.** The pre-commit hook auto-encrypts `.env` → `.env.age` and stages the `.env.age` file. Never commit plaintext `.env` files. If you manually edit `.env`, run `deno task env:encrypt` before committing to ensure the encrypted `.env.age` stays in sync.

### Core Operations

```bash
deno task env:encrypt      # Encrypt all .env files to .env.age
deno task env:decrypt      # Decrypt all .env.age files to .env
```

### .env.example Format

```bash
#region ServiceName
# Database password for ServiceName
# Generate with: head -c 32 /dev/urandom | base64 | tr -d '=' | head -c 32
SERVICE_DB_PASSWORD=REPLACE_WITH_SECURE_PASSWORD
#endregion
```

### .env Format

```bash
#region ServiceName
SERVICE_DB_PASSWORD=abC123...32charSecureString
#endregion
```

**Default username:** `spy4x`

### Git Hooks Automation

The git hooks provide automatic encryption/decryption:

- **pre-commit**: Auto-encrypts .env files before commit
- **post-checkout**: Auto-decrypts .env.age files after branch switch
- **pre-push**: Blocks pushes containing plaintext .env files

**Hook Management:**

```bash
deno task hooks:install          # Install hooks using JSR package
```

## 🏗️ Service Addition Guidelines

Every new service MUST include:

### 1. Stack Definition (`stacks/{name}/compose.yml`)

- Follow existing patterns (networks, Traefik labels, resource limits)
- Container names must match stack name
- Add to server's `config.json` stacks array

### 2. Backup Configuration (`stacks/{name}/backup.ts`)

```typescript
import { BackupConfig } from "@scripts/backup"

const backupConfig: BackupConfig = {
  name: "service-name",
  sourcePaths: "default", // or custom paths
  containers: {
    stop: "default", // or ["container1", "container2"]
  },
}

export default backupConfig
```

**Skip backup configs** for stateless services (no persistent volumes).

### 3. Documentation (`stacks/{name}/README.md`)

- Service description and purpose
- Setup instructions
- Configuration notes
- Troubleshooting tips

### 4. Authentication Protection

**Every non-public service MUST be protected by auth.** Choose the right layer:

- **Authentik SSO** (preferred): Use `middlewares=authentik@file` in Traefik labels. First configure the app in Authentik Admin → Applications → Create, then add the middleware:
  ```yaml
  - "traefik.http.routers.hl-SERVICENAME.middlewares=authentik@file"
  ```
  Authentik blueprints for batch setup are at `servers/home/configs/authentik/blueprints/`.

- **Basic Auth** (fallback): Use `middlewares=auth` for services without their own login:
  ```yaml
  - "traefik.http.routers.hl-SERVICENAME.middlewares=auth"
  ```
  Basic auth credentials are shared from Traefik's `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`.

- **Own auth**: Services with built-in login (Gitea, Vaultwarden, Paperless-ngx, Stirling-PDF) do NOT need additional middleware.

**Rule of thumb:** If a service stores personal data or gives access to infrastructure, protect it. Public services (transit info, scheduling) must have NO auth middleware.

### 5. Dashboard Entry (`servers/home/configs/dash/index.html.template`)

- Add to appropriate section (Home/Cloud/Offsite)
- Use emoji icon and clear naming
- Pattern: subdomain, icon, name
- Add uptime badge from the monitoring server (e.g. `https://uptime-cloud.${DOMAIN}/api/v1/endpoints/home_SERVICENAME/health/badge.svg`)

### 6. Monitoring / Gatus

- Add endpoint to the **opposite server's** gatus config for cross-server monitoring:
  - Home service → add to `servers/cloud/configs/gatus.yml` (group: home)
  - Cloud service → add to `servers/home/configs/gatus.yml` (group: cloud)
- [ ] If the service has auth, add the appropriate `Authorization: Basic ${BASIC_AUTH_BASE64}` header
- [ ] Set appropriate conditions: usually `"[STATUS] == 200"`
- [ ] Add ntfy alert (copy from existing entries)

### 7. DNS Records (Cloudflare)

If the service uses a **new subdomain** (not yet in DNS), add A records via Cloudflare API:

```bash
# Get zone ID
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=antonshubin.com" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")

# Add A record (proxied=false for direct, true for CDN)
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"type":"A","name":"SUBDOMAIN","content":"IP_ADDRESS","ttl":1,"proxied":false}'
```

**When to add DNS**: Only for services that get a **new subdomain** (e.g. `speed-home`, `speed-cloud`). If the subdomain already exists (e.g. existing service on same server), skip.

**Where to find IPs**:

- Cloud: check Hetzner console or `ssh cloudlab "curl -s ifconfig.me"`
- Offsite: check server provider's control panel or `ssh offsite "curl -s ifconfig.me"`
- Home: uses cloud tunnel or dynamic DNS — check existing Cloudflare records

**Token**: stored in `.env.root` as `CLOUDFLARE_API_TOKEN` (encrypted in `.env.root.age`). Read-only + DNS edit scope.

## 📁 Project Structure

```
├── stacks/              # Service catalog (reusable)
│   └── {service}/
│       ├── compose.yml
│       ├── backup.ts
│       └── README.md
├── servers/             # Server-specific configs
│   └── {name}/
│       ├── config.json
│       ├── .env (gitignored)
│       ├── .env.example
│       └── configs/
├── scripts/             # TypeScript automation
│   ├── backup/
│   ├── deploy/
│   ├── ansible/
│   └── +lib.ts
├── ansible/             # Ansible playbooks
└── deno.jsonc          # Deno configuration
```

## 🔧 Development Workflow

1. **Before making changes**: Run `deno task check` to ensure clean state
2. **Make changes**: Follow existing patterns and conventions
3. **After changes**: Run `deno task fix` to auto-format and lint
4. **Final check**: Run `deno task check` to verify all passes

## 🚨 Error Handling Patterns

```typescript
// Use consistent error handling
export function getEnvVar(key: string, isOptional = false): string {
  const value = Deno.env.get(key)
  if (!value && !isOptional) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value || ""
}

// Return structured results from commands
export async function runCommand(
  cmd: string[],
  options?: { sudo?: boolean; cwd?: string },
): Promise<{ success: boolean; output: string; error: string }> {
  // Implementation with error handling
}
```

## 🏗️ Infrastructure as Code Priority

**All configs must be defined in code before anything is deployed manually.** This repo must remain fully reproducible:

1. **Compose files** define what runs, how it's networked, and resource limits
2. **Gatus** monitors every service from the opposite server (cross-server monitoring)
3. **Dashboard** at `dash.${DOMAIN}` lists every service with health badges
4. **Backup configs** protect persistent data
5. **.env + .env.example** (encrypted) contain all secrets
6. **Traefik labels** control routing, TLS, and auth (basic auth middleware = `auth`)
7. **config.json** declares which stacks each server deploys

Before any manual container manipulation: check if the change can be codified in a compose.yml. If it cannot, document the manual step in a README.

## 📝 Key Principles

1. **Infrastructure as Code First**: Everything defined in code, no manual UI changes
2. **Stacks Catalog Pattern**: Services in `stacks/`, servers choose what to deploy
3. **Backups First**: Services with data MUST have backup configs
4. **Follow Patterns**: Check existing examples for similar services
5. **Keep It Simple**: Use defaults unless custom configuration is necessary
6. **No Default Docker Network**: Single-service stacks must alias `default` to `proxy` to avoid wasting Docker subnets. Only multi-service stacks (app ↔ db) get a real `default` network.
7. **Documentation**: Every stack needs README.md

## 🧪 Testing

- Uses Deno's built-in test runner
- Test files: `*.test.ts` pattern
- Currently limited test coverage - tests encouraged but not required
- Run tests with `deno task test`

## 🔄 CI/CD

- No automated CI/CD currently
- Manual checks via `deno task check`
- Focus on local development and manual deployment

## 📋 Quick Reference

| Task        | Command                             | Description                      |
| ----------- | ----------------------------------- | -------------------------------- |
| All checks  | `deno task check`                   | Run lint, fmt, type-check, tests |
| Fix all     | `deno task fix`                     | Auto-fix linting and formatting  |
| Deploy      | `deno task deploy <server>`         | Deploy all services              |
| Deploy one  | `deno task deploy <server> <stack>` | Deploy single stack              |
| Backup      | `deno task backup`                  | Run backup system                |
| SSH         | `deno task ssh <server>`            | SSH into server                  |
| Ansible     | `deno task ansible <playbook>`      | Run Ansible playbooks            |
| Test single | `deno test path/to/file.test.ts`    | Run specific test                |
