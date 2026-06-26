# Rules for all interactions

## Hard rule: NEVER commit plaintext credentials — NEVER hardcode envs

No passwords, tokens, API keys, secrets, private keys, or raw env values in ANY git-tracked file.
Not in `.env.example`, not in scripts, not in docs, not in config, not in comments.
If a file touches git history, assume it's public forever. **Hardcoding envs in scripts is the same leak.**

Instead:
- Use a non-git directory for secrets (e.g. `~/sync/code/opencode-db/`) — Syncthing-only, never a git repo
- `.env` files in non-git dirs for local secrets that need syncing between machines
- **SOPS/age-encrypted `.env.age` for ANY env file committed to git** — mandatory, not optional
- Scripts read from env vars or source `.env` from a non-git dir
- `.env.example` files use `YOUR_KEY_HERE` or `REPLACE_WITH_*` placeholders

## Fail-open principle

Always guard calls to non-critical external services (monitoring, reporting, notifications, analytics) with `|| true` or equivalent. Failure of a supporting subsystem must never block or alter the outcome of the primary operation.

## Language
Respond in English or Russian only. Never use Chinese or other languages.

## Commit convention
Angular convention: `feat|fix|refactor|chore|docs(scope): subject`.
Lowercase, no period, imperative mood.

## Tooling conventions
- Deno imports: prefer `jsr:` and `npm:` specifiers; minimize deps in libs
- TypeScript: interfaces for shapes, enums (start at 1) for constants, types for unions
- No semicolons, 2-space indent, double quotes, 100 col, prose-wrap preserved
- **No grep with `**/file.txt`** — use narrow patterns or Glob first

## Memory & context sources
Before starting a task, check for relevant context:
- `~/sync/code/ai-memory/` — `situation.txt` (current state), `user.txt` (preferences), `todos.txt` (cross-repo priorities)
- Repo-local `AGENTS.md` or `.openhands/` directory (overrides global)
- CalDAV MCP todos (live task list with priorities + due dates)

## Infrastructure conventions (homelab)
- `hl-` prefix for all containers, Traefik router/service names
- `proxy` network for all Traefik-exposed services
- Traefik dynamic config in `stacks/traefik/dynamic.yml`
- Server configs in `servers/{name}/`
- Backup configs in `stacks/{name}/backup.ts`
