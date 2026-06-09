# Cal.diy

[Cal.diy](https://cal.diy) is the open-source community edition of Cal.com — a scheduling platform (Calendly alternative).

## Subdomain

`schedule.${DOMAIN}`

## Setup

1. Deploy the stack
2. Open `https://schedule.${DOMAIN}`
3. Complete the setup wizard to create the first admin user
4. Configure event types, availability, and integrations via the UI

## Environment Variables

| Variable                 | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `CALDIY_DB_PASSWORD`     | PostgreSQL password                                       |
| `CALDIY_NEXTAUTH_SECRET` | NextAuth secret (generate with `openssl rand -base64 32`) |
| `CALDIY_VERSION`         | Image tag (default: `latest`)                             |

## Notes

- First run triggers database migrations automatically
- Configure via UI after initial setup
- SMTP settings use the shared mailserver stack
