# Docker Mail Server

Full-featured mail server with SMTP, IMAP, spam filtering, and antivirus.

## Features

- Postfix (SMTP) + Dovecot (IMAP/POP3)
- Rspamd spam filter
- ClamAV antivirus
- DKIM signing
- Fail2ban protection
- TLS/SSL support

## DNS Requirements

```dns
A       mail                <VPS-IP>
MX      @                   10 mail.yourdomain.com
TXT     @                   v=spf1 mx ip4:<VPS-IP> ~all
TXT     _dmarc              v=DMARC1; p=quarantine
TXT     mail._domainkey     v=DKIM1; k=rsa; p=<key>
PTR     <VPS-IP>            mail.yourdomain.com
```

Get DKIM key:
```bash
docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/*/mail.txt
```

## User Management

```bash
# Add user
docker exec -it mailserver setup email add user@domain.com

# List users
docker exec mailserver setup email list

# Delete user
docker exec mailserver setup email del user@domain.com

# Add alias
docker exec mailserver setup alias add alias@domain.com target@domain.com
```

## Monitoring

```bash
# Check mail queue
docker exec mailserver postqueue -p

# View logs
docker logs mailserver --tail 100

# Test SMTP
telnet mail.yourdomain.com 25
```

## Clients

Use any email client (Thunderbird, Apple Mail, Outlook, etc.):
- IMAP: `mail.yourdomain.com:993` (SSL)
- SMTP: `mail.yourdomain.com:587` (STARTTLS)

## Resources

- [Docker Mailserver Docs](https://docker-mailserver.github.io/docker-mailserver/)
- [Email Setup Guide](https://docker-mailserver.github.io/docker-mailserver/latest/usage/)
