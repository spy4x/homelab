# GitHub Copilot Instructions for Homelab

## General Guidelines

- This is a personal homelab setup managing self-hosted services
- Keep configurations simple and maintainable
- Follow existing patterns and conventions in the codebase
- Use Docker Compose for service definitions
- **Infrastructure as Code (IaC) First**: Everything should be defined in code (compose files, configs, scripts) rather than manual UI changes or terminal commands. Knowledge gets lost, but code doesn't. Manual changes should only be temporary troubleshooting steps that get codified afterwards.

## Environment Variables

**CRITICAL: When adding new environment variables:**

1. **Always add to BOTH files:**
   - `server/.env` - Actual values (gitignored, never commit)
   - `server/.env.example` - Placeholder values (committed to repo)

2. **Format for .env.example:**
   - Use descriptive placeholder values
   - Add comments explaining what the variable is for
   - Add instructions for generating values if needed
   - Group related variables with comments (e.g., `#region ServiceName`)

3. **Format for .env (actual values):**
   - Use real, secure values that work immediately
   - For usernames: Use `spy4x` as the default username
   - For passwords/secrets: Generate secure random strings using:
     ```bash
     head -c 32 /dev/urandom | base64 | tr -d '=' | head -c 32
     ```
   - For tokens: Generate appropriate length (e.g., 64 chars for agent secrets)
   - Group with same `#region` comments as `.env.example`

4. **Security:**
   - Never commit actual secrets to `.env.example`
   - Use placeholders like `YOUR_SECRET_HERE` or `REPLACE_WITH_YOUR_VALUE`
   - Add generation instructions for tokens/passwords
   - Always populate `.env` with working, secure values during setup

## When Adding New Services

**CRITICAL: Every new service MUST include:**

1. **Stack Definition** - Create `stacks/{service-name}/compose.yml`
   - Follow existing stack patterns
   - Include networks, labels for Traefik, resource limits
   - Add to server's `config.json` stacks array

2. **Backup Configuration** - Create `stacks/{service-name}/backup.ts`
   - See detailed guide: `scripts/backup/README.md` → "Adding New Services"
   - Use `"default"` for standard setups
   - Follow existing examples for similar services
   - **Skip backup configs entirely** for stateless/transient services that:
     - Don't mount any volumes for persistent data
     - Store all configuration in compose.yml environment variables
     - Have no user data or state to preserve
     - Examples: Pure proxies without volumes, stateless workers

3. **Documentation** - Add `stacks/{service-name}/README.md`
   - Service description and purpose
   - Setup instructions
   - Configuration notes
   - Troubleshooting tips

4. **Dashboard Entry** - Update homepage
   - For home server: `servers/home/configs/homepage/index.html`
   - Choose appropriate emoji icon
   - Add to correct section (Primary or Secondary Services)
   - Use pattern: subdomain, icon, and clear name

5. **Environment Variables** - If the service needs any:
   - Add to both `servers/{name}/.env` and `.env.example` as described above
   - Document in service comments in compose.yml

6. **Verification** - Before completion:
   - Stack has compose.yml (required)
   - Backup config uses appropriate defaults (if needed)
   - Container names match stack name
   - Dashboard entry added (if applicable)
   - Environment variables added to both files (if needed)
   - Documentation complete

## Key Principles

- **Stacks Catalog**: All services live in `stacks/`, servers choose what to deploy
- **Backups First**: Services with data MUST have backup configs
- **Keep It Simple**: Use defaults unless custom configuration is necessary
- **Follow Patterns**: Check existing stacks for similar examples
- **Documentation**: Every stack needs a README.md

## File Locations

- Service stacks: `stacks/{name}/compose.yml`
- Stack backups: `stacks/{name}/backup.ts`
- Stack docs: `stacks/{name}/README.md`
- Server configs: `servers/{name}/config.json`, `.env`, `configs/`
- Dashboard: `servers/home/configs/homepage/index.html`
