# Vaultwarden

Self-hosted password manager compatible with Bitwarden clients.

## Features

- Password vault with browser extensions
- Secure password sharing
- TOTP 2FA generator
- Emergency access
- Organizations for team sharing

## Configuration

SMTP for password resets and emergency access:

```bash
HOME_SMTP_HOST=mail.yourdomain.com
HOME_SMTP_PORT=587
HOME_SMTP_FROM=noreply@yourdomain.com
HOME_SMTP_USERNAME=noreply@yourdomain.com
HOME_SMTP_PASSWORD=...
```

## Access

- Web Vault: `https://passwords.${DOMAIN}`
- Admin Panel: `https://passwords.${DOMAIN}/admin` (requires `VAULTWARDEN_ADMIN_TOKEN`)

## Clients

Download [Bitwarden clients](https://bitwarden.com/download/):
- Browser extensions (Chrome, Firefox, etc.)
- Desktop apps (Windows, macOS, Linux)
- Mobile apps (iOS, Android)

Point to self-hosted server: `https://passwords.${DOMAIN}`

## Backup

Automated daily via Restic. Database and attachments backed up.

## Resources

- [Vaultwarden Wiki](https://github.com/dani-garcia/vaultwarden/wiki)
- [Bitwarden Help](https://bitwarden.com/help/)
