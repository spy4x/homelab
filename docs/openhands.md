# OpenHands — Standalone Host Deployment (spy4x)

## Architecture Decision

**Why not Docker?** Three dead-end limitations that block a coding agent
that needs full Docker + filesystem access:

1. **Path translation:** Container sees its own filesystem — volume mounts in
   project compose files need host paths that don't exist inside the container.
   The agent can't run `docker compose up` on financy/gb/etc because those
   mounts reference `/home/spy4x/ssd-2tb/...` which doesn't exist inside Docker.

2. **BUILD=0 in docker-sock-proxy:** The proxy limits Docker API surface.
   Even with `BUILD=1`, the container doesn't have the host filesystem to
   `docker buildx` against.

3. **No MCP, no uvx, no npm playground:** The container's ephemeral nature
   means MCP servers (caldav-mcp), project tooling (Deno, uvx, npx), and
   subagent containers all need host access — which Docker-in-Docker can't
   provide reliably.

**Fix:** Run `agent-canvas` directly on the host as the **spy4x** user (UID 1000,
already in `docker` group). Process sandbox, full filesystem, Docker socket
access — identical to what `spy4x` gets from a terminal.

```
┌──────────────────────────────────────────────────────────────────┐
│ homelab host (Fedora 43)                                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────┐          │
│  │ agent-canvas (systemd --user)                       │          │
│  │ User: spy4x  Group: spy4x  Groups: docker,ollama    │          │
│  │ Port: 0.0.0.0:8000                                 │          │
│  │ Sandbox: process (NO container isolation)           │          │
│  │ State: ~/.openhands/                               │          │
│  │ Projects: ~/sync/code/openhands-projects/           │          │
│  │ MCP servers: caldav-mcp, playwright                 │          │
│  │ Mode: --public (API key entry screen)               │          │
│  │                                                    │          │
│  │  ~/.agents/agents/*.md        file-based subagents  │          │
│  │  ~/.openhands/AGENTS.md       system prompt context │          │
│  │  ~/.openhands/mcp.json        MCP config            │          │
│  └──────────────┬─────────────────────────────────────┘          │
│                 │                                                │
│  ┌──────────────▼─────────────────────────────────────┐          │
│  │ Traefik (Docker container on proxy network)         │          │
│  │ http://host-gateway:8000  file-based route          │          │
│  │ Middlewares: authelia@file, robots-deny@file        │          │
│  └──────────────┬─────────────────────────────────────┘          │
│                 │                                                │
│                 ▼ code.antonshubin.com                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────┐          │
│  │ opencode (SSH + tmux, emergency fallback)           │          │
│  └────────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

## Prerequisites

Already present on homelab:
- Node 22.20.0, npm 10.9.3
- `spy4x` user (UID 1000) in `docker` group
- uv installed
- Docker socket at `/var/run/docker.sock`

```bash
node --version    # >= 22.12.x
uv --version      # needed for agent-server uvx runtime
docker ps         # must work without sudo
```

## Installation

### 1. Create project directory

```bash
mkdir -p ~/sync/code/openhands-projects
```

### 2. Install agent-canvas globally

```bash
npm install -g @openhands/agent-canvas
```

Or run via npx (preferred — no global clutter):

```bash
# we'll use npx in systemd
```

### 3. Set up state directory

```bash
mkdir -p ~/.openhands
```

### 4. Restore Docker state (if migrating from Docker container)

```bash
sudo cp -a /home/spy4x/ssd-2tb/apps/.volumes/openhands/* ~/.openhands/
sudo chown -R spy4x:spy4x ~/.openhands/
```

### 5. DeepSeek API key

Already available in `~/.openhands/secrets.json` (migrated from Docker volume)
or set via UI at first launch. Provider: **OpenAI-compatible**, Base URL:
`https://api.deepseek.com/v1`.

### 6. Systemd unit (user-scoped)

OpenHands runs as a **user** service — no root needed, inherits spy4x's
groups (docker, ollama). Create `~/.config/systemd/user/agent-canvas.service`:

```ini
[Unit]
Description=OpenHands Agent Canvas
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/spy4x
Environment=LOCAL_BACKEND_API_KEY=REPLACE_WITH_OPENHANDS_API_KEY_FROM_SERVERS_HOME_ENV
Environment=OH_SECRET_KEY=REPLACE_WITH_OPENHANDS_SECRET_KEY_FROM_SERVERS_HOME_ENV
Environment=GITHUB_TOKEN=REPLACE_WITH_GITHUB_TOKEN_FROM_ENV_ROOT
Environment=LLM_MODEL=deepseek-chat
Environment=LLM_BASE_URL=https://api.deepseek.com/v1
Environment=LLM_API_KEY=REPLACE_WITH_DEEPSEEK_API_KEY
Environment=SANDBOX_VOLUMES=/home/spy4x/sync/code/openhands-projects:/workspace:rw,/home/spy4x/sync/code/financy:/financy:ro,/home/spy4x/sync/code/homelab:/homelab:ro
Environment=RUNTIME=process

ExecStart=npx @openhands/agent-canvas --public
Restart=on-failure
RestartSec=10

# Socket to bind (0.0.0.0 so Traefik on Docker network can reach)
Environment=AGENT_SERVER_BIND_ADDRESS=0.0.0.0

[Install]
WantedBy=default.target
```

**Replace env values** with actual secrets from:
- `servers/home/.env` (decrypt from `.env.age`): `OPENHANDS_API_KEY`, `OPENHANDS_SECRET_KEY`
- `.env.root` (decrypt from `.env.root.age`): `GITHUB_TOKEN`, DeepSeek key

### 7. Enable linger (keep user service alive after logout)

```bash
sudo loginctl enable-linger spy4x
```

### 8. Enable and start

```bash
systemctl --user daemon-reload
systemctl --user enable --now agent-canvas
systemctl --user status agent-canvas
```

### 9. Verify

```bash
curl -s http://127.0.0.1:8000/ | head -5
# Should return index.html
curl -s http://127.0.0.1:8000/health
# {"status":"ok","timestamp":"..."}
```

## Traefik Routing

Already configured in `stacks/traefik/dynamic.yml`:

```yaml
http:
  routers:
    hl-openhands:
      rule: "Host(`code.antonshubin.com`)"
      middlewares:
        - authelia
        - robots-deny
      service: hl-openhands
      tls:
        certResolver: myresolver
  services:
    hl-openhands:
      loadBalancer:
        servers:
          - url: "http://172.23.0.1:8001"
```

**Important:** The gateway IP (`172.23.0.1`) is the Docker proxy network
gateway — stable as long as the proxy network exists. To verify:

```bash
docker network inspect proxy \
  --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
```

## MCP Server Integration

OpenHands supports MCP natively via `~/.openhands/mcp.json`. For stdio-based
servers (caldav-mcp), proxy through `supergateway` to expose as SSE/SHTTP.

### Option A: Proxy approach (production — recommended)

**1. Install supergateway:**

```bash
npm install -g supergateway
```

**2. Run MCP servers as background SSE proxies via systemd user service**
(`~/.config/systemd/user/agent-canvas-mcp.service`):

```ini
[Unit]
Description=OpenHands MCP Proxy Services
PartOf=agent-canvas.service
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/spy4x
Environment=CALDAV_URL=REPLACE_WITH_CALDAV_URL
Environment=CALDAV_USERNAME=REPLACE_WITH_CALDAV_USERNAME
Environment=CALDAV_PASSWORD=REPLACE_WITH_CALDAV_PASSWORD
ExecStart=/bin/sh -c '\
  supergateway --stdio "/home/spy4x/sync/code/opencode-db/caldav-mcp.sh" --port 8765 & \
  supergateway --stdio "npx @playwright/mcp@latest --browser chromium --headless --timeout-navigation 300000" --port 8766 & \
  wait'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

**3. Configure OpenHands MCP** (`~/.openhands/mcp.json`):

```json
{
  "mcpServers": {
    "caldav-mcp": {
      "url": "http://127.0.0.1:8765/sse",
      "transport": "sse"
    },
    "playwright": {
      "url": "http://127.0.0.1:8766/sse",
      "transport": "sse"
    }
  }
}
```

### Option B: Direct stdio (simpler, for testing)

OpenHands supports stdio servers directly. Configure in UI under
**Settings > MCP** or in `~/.openhands/mcp.json`:

```json
{
  "mcpServers": {
    "caldav-mcp": {
      "command": "/home/spy4x/sync/code/opencode-db/caldav-mcp.sh",
      "args": [],
      "transport": "stdio"
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium", "--headless"],
      "transport": "stdio"
    }
  }
}
```

**Tradeoff:** Direct stdio works but lacks concurrency. Proxy approach
(Option A) handles multiple agent sessions better. Start with direct,
move to proxy if needed.

## Agent Configuration — Migrating OpenCode AGENTS.md

OpenCode's `~/.config/opencode/AGENTS.md` content becomes OpenHands agent
instructions via two mechanisms:

### 1. Permanent system context: `~/.openhands/AGENTS.md`

This file is injected into every conversation's system prompt. Place the
core rules from OpenCode's AGENTS.md here:

```markdown
# Rules for all interactions

## Hard rule: NEVER commit plaintext credentials — NEVER hardcode envs
No passwords, tokens, API keys, secrets, private keys in ANY git-tracked file.
Use SOPS/age-encrypted `.env.age` for env files committed to git.
Scripts read from env vars or source `.env` from a non-git dir.

## Fail-open principle
Always guard calls to non-critical external services with `|| true` or
equivalent. Failure of a supporting subsystem must never block the primary
operation.

## Commits
Angular convention: `feat|fix|refactor|chore|docs(scope): subject`.
Lowercase, no period, imperative mood.

## Language
Respond in English or Russian only. Never use Chinese or other languages.

## Memory & context
Before starting a task, check:
- ~/sync/code/ai-memory/ — situation.txt, user.txt, todos.txt
- Repo-local AGENTS.md (overrides global)
- CalDAV todos (via caldav-mcp tool)
```

### 2. File-based subagents: `~/.agents/agents/*.md`

Create specialized subagents that the orchestrator can delegate to,
matching the specialist agents from OpenCode:

**`~/.agents/agents/home-lab-architect.md`:**

```markdown
---
name: home-lab-architect
description: >
  Lead software architect. 10x developer across all areas.
  Deno-first. Modular monorepo with libs/* ownership.
  CQRS for business logic. REST + WebSockets where needed.
  Minimize third-party deps. Store money as ints. Enums start at 1.
  Prioritize scalability, auditability, security.
  <example>Design the architecture for a new feature</example>
  <example>Review this PR for architectural concerns</example>
tools:
  - terminal
  - file_editor
model: deepseek-chat
permission_mode: confirm_risky
---

# Home Lab Architect

## Stack
- Deno + TypeScript backend (jsr: and npm: specifiers)
- Postgres + Valkey for data
- Docker Compose for infrastructure
- Traefik for routing, Authelia for SSO
- Gatus for monitoring

## Code style
- No semicolons, 2-space indent, double quotes, 100 col
- TypeScript: interfaces for shapes, enums (start at 1) for constants, types for unions
- Commit: Angular convention

## Key principles
1. Infrastructure as Code First — everything in code, no manual UI changes
2. hl- prefix for all container names and Traefik router/service names
3. Backups First — services with data MUST have backup configs
4. Follow Patterns — check existing examples
5. No Default Docker Network — single-service stacks alias `default` to `proxy`

## Environment & secrets
- NEVER hardcode credentials
- Use SOPS/age-encrypted .env.age for committed env files
- Scripts read from env vars or source .env from non-git dir
```

**`~/.agents/agents/devops-engineer.md`:**

```markdown
---
name: devops-engineer
description: >
  Infra and deploys for self-hosting (Fedora/Hetzner).
  Docker Compose, Traefik, Ansible, systemd, backup automation.
  <example>Deploy this stack to production</example>
  <example>Debug why this container won't start</example>
tools:
  - terminal
  - file_editor
model: deepseek-chat
permission_mode: confirm_risky
---

# DevOps Engineer

## Environment
- Target: Fedora servers (homelab, cloud)
- Docker Compose for services, Traefik for reverse proxy
- Git-based deployment: push configs, pull on server, `docker compose up -d`
- Monitoring: Gatus (cross-server), ntfy alerts

## Operations
- `deno task deploy <server> <stack>` — deploy a stack
- `deno task backup` — run backup system
- `systemctl --user status agent-canvas` — check OpenHands health
- Secrets in `.env` files, encrypted with SOPS/age, never committed

## Container conventions
- hl- prefix for all containers, routers, services
- proxy network for all Traefik-exposed services
- Resource limits on every service
- no-new-privileges:true security opt
```

**`~/.agents/agents/qa-reviewer.md`:**

```markdown
---
name: qa-reviewer
description: >
  Writes and runs deterministic tests. Verifies changes and cleanup.
  <example>Write tests for this module</example>
  <example>Run the test suite and report failures</example>
tools:
  - terminal
  - file_editor
model: deepseek-chat
---

# QA Reviewer

## Testing
- Deno's built-in test runner
- Test files: *.test.ts pattern
- Run: `deno test` or `deno test path/to/file.test.ts`
- Write deterministic tests with clear assertions
- Cover edge cases, error paths, and happy paths

## Verification
- Verify the fix actually solves the reported issue
- Check for regressions
- Ensure no secrets leaked in test fixtures
```

**`~/.agents/agents/security-auditor.md`:**

```markdown
---
name: security-auditor
description: >
  Threat-modeling and red-teaming. Authn/authz and secure defaults.
  <example>Security review this PR</example>
  <example>Check for hardcoded secrets in this codebase</example>
tools:
  - terminal
  - file_editor
model: deepseek-chat
permission_mode: confirm_risky
---

# Security Auditor

## Priorities
1. NO hardcoded credentials — check all files
2. Authn/authz — proper middleware, no bypasses
3. Secrets management — SOPS/age encryption, no plaintext .env in git
4. Container security — no-new-privileges, read-only where possible
5. Input validation — SQL injection, XSS, path traversal

## Checks
- grep for passwords, tokens, API keys in tracked files
- Verify .env is in .gitignore, .env.age is tracked
- Check Traefik middleware chains for missing auth
- Review docker socket access scope
```

## LLM Configuration

### DeepSeek V4 Flash (default — cheap, fast)

UI → Settings → LLM:
- Provider: **Custom OpenAI**
- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat` (V4 Flash)
- API Key: DeepSeek `sk-...` key

### DeepSeek V4 Pro (high-cognitive work)

Add as LLM profile in UI → Settings → LLM Profiles:
- Name: `DeepSeek V4 Pro`
- Provider: **Custom OpenAI**
- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-reasoner` (V4 Pro / R1)

During a conversation, switch between profiles via the model selector.
Use Flash for simple tasks (bugfixes, formatting), Pro for complex
multi-step architectural work.

### Cost estimation
| Model          | Input $/M tok | Output $/M tok | Use case                    |
| -------------- | ------------- | -------------- | --------------------------- |
| deepseek-chat  | ~0.27         | ~1.10          | Simple tasks, bugfixes      |
| deepseek-reasoner | ~0.55     | ~2.19          | Architecture, multi-step    |

Both are cheap enough for daily use (~cents/day).

## Project Workflow

### Starting a project

1. Open `https://code.antonshubin.com` → authenticate (Authelia + API key)
2. UI prompts for `LOCAL_BACKEND_API_KEY` on first visit
3. "Open Repository" → enter local path or GitHub URL
4. Agent reads context (AGENTS.md, .agents/skills/, ~/sync/code/ai-memory/)
5. Delegate to subagents via task tool

### Working with financy (multi-container)

```bash
# Agent can do this directly:
cd ~/sync/code/financy
docker compose up -d          # starts all services
docker compose ps               # verify health
deno task check                 # run lint + test + type-check
docker compose down            # cleanup when done
```

The agent spawns only necessary containers for development, not the full
production stack. Since it runs as `spy4x` with `docker` group, there's
no Docker-in-Docker translation — the agent runs commands exactly as you would.

### Working with homelab (this repo)

```bash
cd ~/sync/code/homelab
docker compose --project-name hl up -d some-stack
deno task check
deno task deploy home some-stack
```

## Security Hardening

| Layer | Mechanism |
|-------|-----------|
| **SSO** | Authelia 2FA in front of the URL |
| **API key** | `--public` mode: frontend doesn't bake key, user pastes it |
| **User** | Runs as `spy4x` — same user you SSH with, no extra user to manage |
| **Scope** | Process sandbox = full host access (identical to your terminal) |
| **Docker scope** | `docker` group membership gives Docker API access (same as your user) |
| **Confirmation mode** | OpenHands settings: enable `confirm_risky` for HIGH-risk commands |
| **MCP isolation** | MCP servers run as separate processes, can be restarted independently |

**Tradeoff:** The `docker` group membership is the largest attack surface.
Any compromised agent with Docker access can trivially escape to root.
Mitigations:

- Only expose to projects you trust via the same LLM you'd trust in OpenCode
- The LLM is identical (DeepSeek API) — risk is the same as running OpenCode
  with `allowExecute: true`
- Container escape requires malicious intent, which requires prompt injection;
  prompt injection affects OpenCode identically
- **OpenHands has no sandbox** (process mode) — it's equivalent to a user
  logged in via SSH. This is intentional: the agent needs full access.

## Multi-Device Access

- **Phone/tablet:** `https://code.antonshubin.com` — fully responsive web UI
- **Laptop:** Same URL, or `ssh homelab` + `tmux` for terminal fallback
- **Any device with a browser:** Authelia 2FA + API key prompts

No VPN required — Authelia provides SSO. API key adds a second factor
specific to OpenHands.

## GitHub Issues → Agent → PRs Flow

1. Open `https://code.antonshubin.com` → authenticate
2. "Open Repository" → enter GitHub repo URL → "Launch"
3. Agent reads issues, clones code, makes changes
4. Agent creates branch, commits, pushes, opens PR
5. Review PR on GitHub, merge

**Multi-project:** Each conversation is independent. Open multiple tabs
for different repos/issues.

**Automations (beta):** The automation server (part of agent-canvas) can
respond to GitHub webhooks → auto-agent new issues. See [Automations docs](https://docs.openhands.dev/openhands/usage/automations/overview).

## Keeping OpenCode

OpenCode stays your emergency + MCP-native tool:

```bash
# On any machine:
opencode  # Normal local usage

# Remote via SSH + tmux:
ssh homelab -t "tmux new-session -A -s opencode"
```

Use OpenCode when:
- OpenHands UI is unreachable
- Need real-time command-by-command supervision
- Working with MCP servers natively (no proxy layer)
- Sensitive operations (database, secrets) — faster context switch
- OpenHands agent-server crashes or needs debugging

## Backup

OpenHands state lives in `~/.openhands/`. Include in existing backup
system:

```bash
# Already backed up if ~/.openhands/ is on syncthing path
# Verify:
ls ~/.openhands/
# agent-canvas/  automation/  cache/  profiles/  secrets.json  settings.json
```

No separate backup stack needed — the Docker volume migration was one-time.
Agent-canvas manages its own state. Workspaces are ephemeral (recreated
from git on demand).

## Migration Checklist

- [x] Node 22+ installed (22.20.0)
- [x] uv installed
- [x] spy4x user in docker group
- [x] Traefik route configured for `code.antonshubin.com`
- [x] Authelia middleware on the route
- [ ] Create `~/sync/code/openhands-projects/`
- [ ] Copy state from Docker volume to `~/.openhands/`
- [ ] Create systemd user unit (`~/.config/systemd/user/agent-canvas.service`)
- [ ] Populate env vars from `servers/home/.env` and `.env.root`
- [ ] Create `~/.openhands/AGENTS.md` with core rules
- [ ] Create file-based subagents in `~/.agents/agents/`
- [ ] Configure MCP servers (Option A or B)
- [ ] Enable linger: `sudo loginctl enable-linger spy4x`
- [ ] Enable + start: `systemctl --user enable --now agent-canvas`
- [ ] Verify standalone: `curl -s http://127.0.0.1:8000/health`
- [ ] Stop Docker OpenHands container: `docker compose --project-name hl stop openhands`
- [ ] Test HTTPS: `curl -sk https://code.antonshubin.com/` → Authelia redirect
- [ ] Log in via browser, configure DeepSeek LLM profiles
- [ ] Test with a simple task on homelab repo
- [ ] Test MCP tools (caldav-mcp, playwright) via agent
- [ ] Test financy project: `cd ~/sync/code/financy && docker compose up -d`

## Troubleshooting

### agent-canvas won't start
```bash
systemctl --user status agent-canvas
journalctl --user -u agent-canvas -n 50
# Check env vars, node version, port conflicts
```

### MCP servers not connecting
```bash
# Direct stdio: check agent-canvas logs for MCP init errors
# Proxy: check proxy health
curl -s http://127.0.0.1:8765/health || echo "caldav proxy dead"
curl -s http://127.0.0.1:8766/health || echo "playwright proxy dead"
# Restart proxy service:
systemctl --user restart agent-canvas-mcp
```

### Docker commands failing
```bash
# Verify docker group membership
groups spy4x | grep docker
# Check socket permissions
ls -la /var/run/docker.sock
# srw-rw---- root docker  → spy4x must be in docker group
```

### Port 8000 already in use
```bash
ss -tlnp | grep 8000
# Kill the old process or change PORT in systemd unit
```

## Resources

- [OpenHands Docs](https://docs.openhands.dev/)
- [Agent Canvas Overview](https://docs.openhands.dev/openhands/usage/agent-canvas/overview)
- [VM/Self-Hosted Installation](https://docs.openhands.dev/openhands/usage/agent-canvas/backend-setup/vm)
- [MCP Settings](https://docs.openhands.dev/openhands/usage/settings/mcp-settings)
- [File-Based Agents](https://docs.openhands.dev/sdk/guides/agent-file-based)
- [Skills Overview](https://docs.openhands.dev/overview/skills)
- [Repository Customization](https://docs.openhands.dev/openhands/usage/customization/repository)
- [OpenHands GitHub](https://github.com/OpenHands/OpenHands)
