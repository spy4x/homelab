# Mailserver

Full-featured self-hosted email server based on [Docker Mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/).

## Features

- **SMTP/IMAP**: Full email server with submission and secure IMAP access
- **Security**: SPF, DKIM (2048-bit), DMARC, Fail2ban, virus scanning (ClamAV)
- **Spam filtering**: Rspamd with web UI
- **SSL/TLS**: Let's Encrypt certificates via Traefik
- **Multi-domain**: Supports multiple email domains (antonshubin.com, neatsoft.dev)

## Email Clients Configuration

### Thunderbird / Desktop Clients

**Incoming (IMAP):**

- Server: `mail.antonshubin.com`
- Port: `993`
- Security: `SSL/TLS`
- Authentication: `Normal password`

**Outgoing (SMTP):**

- Server: `mail.antonshubin.com`
- Port: `465` (SSL/TLS) or `587` (STARTTLS)
- Security: `SSL/TLS` or `STARTTLS`
- Authentication: `Normal password`

**Note**: Use `mail.antonshubin.com` as the server for **both** `anton@antonshubin.com` and `anton@neatsoft.dev` accounts.

## SSL Certificates

The mailserver uses Let's Encrypt certificates obtained by Traefik. A helper service (`mail-cert-helper`) runs to trigger certificate generation for mail subdomains.

**Certificate Management:**

- Certificates are extracted from Traefik's `acme.json` during deployment (via `before.deploy.ts`)
- **Automatic renewal**: Daily cronjob at 03:15 copies updated certificates from Traefik and restarts mailserver
- Let's Encrypt certificates auto-renew every 60-90 days in Traefik, cronjob keeps mailserver in sync
- Logs: `~/.local/share/homelab/apps/.logs/mailserver-cert-renewal.log`

**Manual certificate update:**

```bash
cd ~/homelab/apps
VOLUMES_PATH=~/.local/share/homelab/apps/.volumes bash stacks/mailserver/extract-certs.sh mail.antonshubin.com
```

## DNS Configuration

All DNS records are already configured in Cloudflare. See the records below for reference.

### Current DNS Records

**SPF, DKIM, DMARC**: ✅ Configured\
**MX Records**: ✅ Configured\
**A Records for mail subdomains**: ✅ Configured\
**PTR (Reverse DNS)**: ⚠️ Must be configured at VPS provider (Hetzner, etc.)

**Important**: PTR record (reverse DNS) **MUST** be set at your VPS provider to match `mail.antonshubin.com`. Many email providers will reject mail without proper reverse DNS. Configure this in your VPS control panel.

### Getting DKIM Public Key

After first deployment, retrieve DKIM public key and add to DNS:

```bash
# Get DKIM key for your domain
docker exec mailserver cat /tmp/docker-mailserver/rspamd/dkim/mail.txt

# Add as TXT record in Cloudflare:
# Name: mail._domainkey
# Type: TXT
# Content: v=DKIM1; k=rsa; p=<key_from_above>
```

### Verify DNS Records

```bash
# Check MX record
dig antonshubin.com MX +short

# Check SPF record
dig antonshubin.com TXT +short | grep spf

# Check DKIM record
dig mail._domainkey.antonshubin.com TXT +short

# Check DMARC record
dig _dmarc.antonshubin.com TXT +short

# Test mail server connectivity
telnet mail.antonshubin.com 587
```

## Managing Email Accounts

```bash
# Add new account
docker exec -it mailserver setup email add user@domain.com

# List accounts
docker exec mailserver setup email list

# Change password
docker exec -it mailserver setup email update user@domain.com

# Delete account
docker exec -it mailserver setup email del user@domain.com
```

## Rspamd Web UI

Access spam filter management at: `https://rspamd.antonshubin.com`

## Testing Email Delivery

1. **Port25 Verifier**: `check-auth@verifier.port25.com`
2. **Mail Tester**: https://www.mail-tester.com/
3. **MXToolbox**: https://mxtoolbox.com/deliverability

## Troubleshooting

```bash
# Check logs
docker logs mailserver -f

# Check mail queue
docker exec mailserver postqueue -p

# Verify certificate validity
docker exec mailserver openssl x509 -in /etc/letsencrypt/live/mail.*/cert.pem -noout -dates

# Test SMTP
docker exec mailserver swaks \
  --to test@example.com \
  --from anton@antonshubin.com \
  --server localhost --port 587 --tls \
  --auth LOGIN \
  --auth-user anton@antonshubin.com \
  --auth-password "password"

# Check Rspamd stats
docker exec mailserver rspamc stat

# Check Fail2ban status
docker exec mailserver fail2ban-client status

# View certificate renewal logs
tail -f ~/.local/share/homelab/apps/.logs/mailserver-cert-renewal.log
```

## Initial Setup Checklist

After first deployment:

- [ ] Get DKIM key: `docker exec mailserver cat /tmp/docker-mailserver/rspamd/dkim/mail.txt`
- [ ] Add DKIM TXT record to Cloudflare DNS (name: `mail._domainkey`)
- [ ] Create email accounts: `docker exec -it mailserver setup email add user@domain.com`
- [ ] Test email delivery: https://www.mail-tester.com/
- [ ] Setup certificate renewal cronjob: `deno task ansible ansible/playbooks/after-deploy/mailserver-certs-renewal.yml cloud`
- [ ] Verify Fail2ban is running: `docker exec mailserver fail2ban-client status`
- [ ] Test Thunderbird/email client connection
- [ ] Setup Rspamd web UI password (uses Traefik basic auth)

## References

- [Docker Mailserver Docs](https://docker-mailserver.github.io/docker-mailserver/latest/)
- [Rspamd Docs](https://rspamd.com/doc/)
