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

1. **Backup Configuration** - Create `server/scripts/backup/configs/[service-name].backup.ts`
   - See detailed guide: `server/scripts/backup/README.md` → "Adding New Services"
   - Use `"default"` for standard setups
   - Follow existing examples for similar services
   - **Skip backup configs entirely** for stateless/transient services that:
     - Don't mount any volumes for persistent data
     - Store all configuration in compose.yml environment variables
     - Have no user data or state to preserve
     - Examples: NFS server, Samba, pure proxies without volumes

2. **Dash Entry** - Add service to `servers/home/localStacks/homepage/src/index.html`
   - Choose appropriate emoji icon
   - Add to correct section (Primary or Secondary Services)
   - Use pattern: subdomain, icon, and clear name

3. **Environment Variables** - If the service needs any:
   - Add to both `.env` and `.env.example` as described above
   - Document in service comments in compose.yml

4. **Verification** - Before completion:
   - Backup config uses appropriate defaults
   - Container names match docker-compose
   - Dash entry added
   - Environment variables added to both files

## Key Principles

- **Backups First**: No service is complete without backup configuration
- **Keep It Simple**: Use defaults unless custom configuration is necessary
- **Follow Patterns**: Check existing services for similar examples
- **Documentation**: Update relevant README files when adding new features

## File Locations

- Docker services: `server/compose.yml`, `secondary/compose.yml`, `experiments/compose.yml`
- Backup scripts: `server/scripts/backup/configs/*.backup.ts`
- Dash: `servers/home/localStacks/homepage/src/index.html`
