# Cloud Server - Email & Monitoring

Hetzner VPS running email infrastructure and monitoring services.

## Services

- **Docker Mail Server**: Full SMTP/IMAP with Rspamd, ClamAV, Fail2ban
- **Roundcube**: Webmail interface
- **Gatus**: Status page and monitoring
- **Healthchecks**: Cron job monitoring
- **ntfy**: Notification service
- **Syncthing**: Backup synchronization
- **Traefik**: Reverse proxy with Let's Encrypt

## Quick Setup

### 1. DNS Configuration

**Required DNS records** (replace `<VPS-IP>` with your server IP):

```dns
# Mail server
A       mail                <VPS-IP>
MX      @                   10 mail.yourdomain.com
TXT     @                   v=spf1 mx ip4:<VPS-IP> ~all
TXT     _dmarc              v=DMARC1; p=quarantine; rua=mailto:your@email.com

# Service subdomains
A       webmail             <VPS-IP>
A       uptime              <VPS-IP>
A       ntfy                <VPS-IP>
A       rspamd              <VPS-IP>
A       proxy-cloud         <VPS-IP>
A       sync-cloud          <VPS-IP>

# PTR record (in Hetzner console)
PTR     <VPS-IP>            mail.yourdomain.com
```

### 2. Deploy

See main [README.md](../../README.md) for setup and deployment instructions.

### 3. Configure DKIM

Wait 2 minutes for services to start, then:

```bash
ssh root@<VPS-IP>
cd /opt/cloud
docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/*/mail.txt
```

Add output as DNS TXT record:

```dns
TXT     mail._domainkey     v=DKIM1; k=rsa; p=<key-from-output>
```

### 4. Create Email Accounts

```bash
docker exec -it mailserver setup email add your@domain.com
docker exec -it mailserver setup email add noreply@domain.com
```

Save `noreply@domain.com` password to `.env` as `CLOUD_SMTP_PASSWORD`.

## Email Management

```bash
# List accounts
docker exec mailserver setup email list

# Add account
docker exec -it mailserver setup email add user@domain.com

# Delete account
docker exec mailserver setup email del user@domain.com

# Add alias
docker exec mailserver setup alias add alias@domain.com target@domain.com

# Check mail queue
docker exec mailserver postqueue -p

# View logs
docker logs mailserver --tail 100
```

## Web Interfaces

- **Webmail**: https://webmail.yourdomain.com
- **Rspamd** (spam filter): https://rspamd.yourdomain.com
- **Uptime Monitoring**: https://uptime.yourdomain.com
- **Notifications**: https://ntfy.yourdomain.com
- **Traefik Dashboard**: https://proxy-cloud.yourdomain.com

## Monitoring

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

Backup configs in `servers/cloud/backup-configs/`. Run backups:

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
