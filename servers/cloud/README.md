# Cloud Server

Email infrastructure and external monitoring on Hetzner VPS.

## Services

**Email** - [Mail Server](docs/mailserver.md), [Roundcube](docs/roundcube.md)  
**Monitoring** - [Gatus](../../sharedStacks/gatus/), [Healthchecks](docs/healthchecks.md), [ntfy](../../sharedStacks/ntfy/)  
**Infrastructure** - [Traefik](../../sharedStacks/traefik/), [Syncthing](../../sharedStacks/syncthing/)

## Hardware

- **Provider**: Hetzner VPS
- **OS**: Ubuntu 22.04
- **Network**: Public IPv4, 24/7 uptime

## DNS Requirements

```dns
A       mail                <VPS-IP>
MX      @                   10 mail.yourdomain.com
TXT     @                   v=spf1 mx ip4:<VPS-IP> ~all
TXT     _dmarc              v=DMARC1; p=quarantine
TXT     mail._domainkey     v=DKIM1; k=rsa; p=<get-from-server>
PTR     <VPS-IP>            mail.yourdomain.com
```

Get DKIM key after deployment:
```bash
docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/*/mail.txt
```

## Email Management

```bash
# Add user
docker exec -it mailserver setup email add user@domain.com

# List users
docker exec mailserver setup email list

# Add alias
docker exec mailserver setup alias add alias@domain.com target@domain.com
```

See [mailserver docs](docs/mailserver.md) for details.

## Access

- Webmail: `https://webmail.${DOMAIN}`
- Rspamd: `https://rspamd.${DOMAIN}`
- Monitoring: `https://uptime.${DOMAIN}`

## Deployment

```bash
deno task deploy cloud
```

See main [README](../../README.md) for setup instructions.

**Gatus** monitors both cloud and home servers. Configure in
`.volumes/gatus/config.yaml`.

**Healthchecks** monitors cron jobs and sends email alerts via the mail server.

## Testing

```bash
# Test SMTP
telnet mail.yourdomain.com 587

# Test email deliverability
# Send to: check-auth@verifier.port25.com
# Or use: https://www.mail-tester.com

# Check DNS
dig mail.yourdomain.com +short
dig yourdomain.com MX +short
dig mail._domainkey.yourdomain.com TXT +short
```

## Troubleshooting

```bash
# Check container status
docker compose ps

# View logs
docker logs mailserver
docker logs webmail
docker logs gatus

# Enter mail container
docker exec -it mailserver bash

# Check Rspamd stats
docker exec mailserver rspamc stat

# Check Fail2ban
docker exec mailserver fail2ban-client status
```

## Backups

Backup configs in `servers/cloud/configs/backup/`. Run backups:

```bash
deno run --env-file=.env -A scripts/backup/+main.ts
```

Configure automated backups:

```bash
ansible-playbook ansible/playbooks/backup-cronjob.yml -K --limit cloud
```

## Notes

- Email accounts managed via docker exec (not stored in compose/env files)
- SMTP credentials for other services use `noreply@domain.com` account
- Gatus should monitor home server and vice versa for cross-checking
- Syncthing syncs backups between cloud and home servers
