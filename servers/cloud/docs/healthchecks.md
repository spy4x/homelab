# Healthchecks

Cron job monitoring with alerts for missed tasks.

## Features

- Monitor scheduled tasks
- HTTP ping endpoint
- Email/webhook alerts
- Grace period configuration
- Status page

## Access

Web UI: `https://healthchecks.${DOMAIN}`

## Usage

Create check in UI, then ping endpoint from cron job:

```bash
# In crontab
0 2 * * * /path/to/backup.sh && curl -fsS -m 10 --retry 5 https://healthchecks.yourdomain.com/ping/YOUR-UUID
```

Alert fires if ping not received within expected interval.

## Resources

- [Healthchecks Documentation](https://healthchecks.io/docs/)
