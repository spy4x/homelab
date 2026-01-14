# AGENTS.md - Development Guidelines for Agentic Coding

This file contains guidelines for agentic coding agents (including AI assistants) working in this homelab infrastructure repository.

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
deno task deploy <server>     # Deploy services to server
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
import { success, error } from "./+lib.ts"

// Use JSR modules for standard library
import { getEnvVar } from "@std/dotenv"

// Use alias imports for shared scripts
import { BackupConfig } from "@scripts/backup"
```

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

**CRITICAL: Always add environment variables to BOTH files:**

1. **`servers/{name}/.env`** - Actual values (gitignored)
2. **`servers/{name}/.env.example`** - Placeholders (committed)

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
  sourcePaths: "default",  // or custom paths
  containers: {
    stop: "default",       // or ["container1", "container2"]
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

### 4. Dashboard Entry (`servers/home/configs/homepage/index.html`)
- Add to appropriate section (Primary/Secondary)
- Use emoji icon and clear naming
- Pattern: subdomain, icon, name

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

## 📝 Key Principles

1. **Infrastructure as Code First**: Everything defined in code, no manual UI changes
2. **Stacks Catalog Pattern**: Services in `stacks/`, servers choose what to deploy
3. **Backups First**: Services with data MUST have backup configs
4. **Follow Patterns**: Check existing examples for similar services
5. **Keep It Simple**: Use defaults unless custom configuration is necessary
6. **Documentation**: Every stack needs README.md

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

| Task | Command | Description |
|------|---------|-------------|
| All checks | `deno task check` | Run lint, fmt, type-check, tests |
| Fix all | `deno task fix` | Auto-fix linting and formatting |
| Deploy | `deno task deploy <server>` | Deploy services |
| Backup | `deno task backup` | Run backup system |
| SSH | `deno task ssh <server>` | SSH into server |
| Ansible | `deno task ansible <playbook>` | Run Ansible playbooks |
| Test single | `deno test path/to/file.test.ts` | Run specific test |