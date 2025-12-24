# Radicale

Lightweight CalDAV and CardDAV server for calendars and contacts.

## Overview

[Radicale](https://radicale.org/) is a small but powerful CalDAV (calendars) and CardDAV (contacts) server. Perfect for syncing calendar events and contacts across devices without relying on cloud services.

## Features

- CalDAV and CardDAV support
- Simple authentication
- Git backend for version control (optional)
- Lightweight (~256M RAM)
- Web interface for basic management
- Compatible with standard calendar/contact apps

## Configuration

### Environment Variables

No additional environment variables required - uses standard timezone:

```bash
TIMEZONE=Europe/Moscow  # Already in server .env
```

### Data Storage

Calendars and contacts stored in:

```
.volumes/radicale/
├── data/       # Calendar/contact data
└── config/     # Server configuration
```

## Client Setup

### iOS/macOS

1. Settings → Passwords & Accounts → Add Account → Other
2. Add CalDAV Account:
   - Server: `radicale.${DOMAIN}`
   - Username: `spy4x` (or custom)
   - Password: (configured in Radicale)
   - Use SSL: Yes

3. Add CardDAV Account (same process for contacts)

### Android

Use DAVx⁵ app:

1. Install DAVx⁵ from F-Droid or Play Store
2. Add account with URL: `https://radicale.${DOMAIN}`
3. Enter credentials
4. Select calendars and address books to sync

### Thunderbird

1. Install TbSync addon
2. Add CalDAV/CardDAV account
3. Server: `https://radicale.${DOMAIN}`

## Access

Web interface: `https://radicale.${DOMAIN}`

## First-Time Setup

1. Configure authentication in config file (basic auth recommended)
2. Create your first calendar/address book via web interface
3. Set up clients using instructions above
4. Import existing calendars/contacts if needed

## Backup

Included in backup configuration. Backs up:

- `/data` - All calendars and contacts
- `/config` - Server configuration

## Resource Usage

- Memory: 256M limit
- CPU: 0.25 cores
- Disk: Minimal (text-based storage)

## Notes

- Data is stored as plain text `.ics` and `.vcf` files
- Consider enabling git backend for automatic versioning
- Supports multiple users (configure in settings)
- Web UI is basic - use dedicated client apps for best experience
- No two-way Google Calendar sync (use export/import instead)
