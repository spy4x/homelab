# GitHub Copilot Instructions for Homelab

## General Guidelines

- This is a personal homelab setup managing self-hosted services
- Keep configurations simple and maintainable
- Follow existing patterns and conventions in the codebase
- Use Docker Compose for service definitions

## When Adding New Services

**CRITICAL: Every new service MUST include:**

1. **Backup Configuration** - Create `server/scripts/backup/configs/[service-name].backup.ts`
   - See detailed guide: `server/scripts/backup/README.md` → "Adding New Services"
   - Use `"default"` for standard setups
   - Follow existing examples for similar services
   - Obviously skip backup for transient or non-persistent services

2. **Homepage Entry** - Add service to `server/homepage/src/index.html`
   - Choose appropriate emoji icon
   - Add to correct section (Primary or Secondary Services)
   - Use pattern: subdomain, icon, and clear name

3. **Verification** - Before completion:
   - Backup config uses appropriate defaults
   - Container names match docker-compose
   - Homepage entry added

## Key Principles

- **Backups First**: No service is complete without backup configuration
- **Keep It Simple**: Use defaults unless custom configuration is necessary
- **Follow Patterns**: Check existing services for similar examples
- **Documentation**: Update relevant README files when adding new features

## File Locations

- Docker services: `server/compose.yml`, `secondary/compose.yml`, `experiments/compose.yml`
- Backup scripts: `server/scripts/backup/configs/*.backup.ts`
- Homepage: `server/homepage/src/index.html`
