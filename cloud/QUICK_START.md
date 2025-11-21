# Cloud Infrastructure Quick Start

## 🚀 Quick Deployment Guide

### 1. Prerequisites
- Hetzner account
- Domain: `antonshubin.com`
- Ansible installed locally
- SSH key configured

### 2. Create Hetzner VPS
```
Name: mail-server
Location: Falkenstein (fsn1)
Image: Fedora 41
Type: CPX11 (2 vCPU, 2GB RAM)
Cost: €4.51/month
```

### 3. Configure DNS (Do This First!)
```dns
# Mail server
Type: A, Name: mail, Value: <VPS-IP>

# MX record
Type: MX, Name: @, Priority: 10, Value: mail.antonshubin.com

# SPF
Type: TXT, Name: @, Value: v=spf1 mx ip4:<VPS-IP> ~all

# DMARC
Type: TXT, Name: _dmarc, Value: v=DMARC1; p=quarantine; rua=mailto:2spy4x@gmail.com

# Reverse DNS (in Hetzner console)
Set PTR record: mail.antonshubin.com

# Service subdomains
Type: A, Name: webmail, Value: <VPS-IP>
Type: A, Name: monitor, Value: <VPS-IP>
Type: A, Name: notify, Value: <VPS-IP>
Type: A, Name: rspamd, Value: <VPS-IP>
Type: A, Name: proxy, Value: <VPS-IP>
```

### 4. Update Ansible Inventory
Edit `cloud/ansible/inventory.yml`:
```yaml
ansible_host: <VPS-IP>
```

### 5. Run Initial Setup
```bash
cd cloud/ansible
ansible-playbook playbooks/initial-setup.yml
```

### 6. Configure Environment
```bash
cp cloud/.env.example cloud/.env
nano cloud/.env
# Update: DOMAIN, CONTACT_EMAIL, BASIC_AUTH_PASSWORD
```

### 7. Deploy Services
```bash
cd cloud/ansible
ansible-playbook playbooks/deploy.yml
```

### 8. Configure DKIM (Wait 5 min for services to start)
```bash
ssh root@<VPS-IP>
cd /opt/cloud
make mail-dkim-show
# Copy output and add to DNS as TXT record: mail._domainkey
```

### 9. Create Email Account
```bash
ssh root@<VPS-IP>
cd /opt/cloud
make mail-user-add EMAIL=anton@antonshubin.com
make mail-user-add EMAIL=noreply@antonshubin.com
```

### 10. Test Email
- Send test to: check-auth@verifier.port25.com
- Or use: https://www.mail-tester.com (aim for 10/10)

### 11. Configure Vaultwarden SMTP
Update `/home/spy4x/ssd-2tb/apps/.env`:
```env
SMTP_HOST=mail.antonshubin.com
SMTP_PORT=587
SMTP_FROM=noreply@antonshubin.com
SMTP_USERNAME=noreply@antonshubin.com
SMTP_PASSWORD=<password-from-step-9>
```

Update `server/compose.yml` (vaultwarden environment)

Redeploy:
```bash
cd ~/ssd-2tb/apps
docker compose up -d vaultwarden
```

### 12. Setup Backups
```bash
cd cloud/ansible
ansible-playbook playbooks/backup-cronjob.yml
```

## ⚡ Daily Commands

### Email Management
```bash
# List users
make mail-user-list

# Add user
make mail-user-add EMAIL=user@antonshubin.com

# Delete user
make mail-user-del EMAIL=user@antonshubin.com

# Add alias
make mail-alias-add ALIAS=info@antonshubin.com TARGET=anton@antonshubin.com
```

### Service Management
```bash
# Check status
make status

# View logs
make logs

# Restart services
make restart

# Show DKIM key
make mail-dkim-show
```

### Monitoring
```bash
# Check mail queue
docker exec mailserver postqueue -p

# View mail logs
docker logs mailserver | tail -100

# Check configuration
make mail-check-config

# Debug info
make mail-debug
```

## 🌐 Web Interfaces

- Webmail: https://webmail.antonshubin.com
- Spam Filter: https://rspamd.antonshubin.com (auth: spy4x)
- Monitoring: https://monitor.antonshubin.com
- Notifications: https://notify.antonshubin.com
- Proxy Dashboard: https://proxy.antonshubin.com (auth: spy4x)

## 📧 Client Setup

### Thunderbird
```
IMAP: mail.antonshubin.com:993 (SSL/TLS)
SMTP: mail.antonshubin.com:587 (STARTTLS)
Username: anton@antonshubin.com
```

### Mobile (iOS/Android)
```
Incoming: mail.antonshubin.com:993 (SSL/TLS)
Outgoing: mail.antonshubin.com:587 (STARTTLS)
```

## 🔧 Troubleshooting

```bash
# Check if ports are open
telnet mail.antonshubin.com 25
telnet mail.antonshubin.com 587

# Test DNS
dig mail.antonshubin.com +short
dig antonshubin.com MX +short

# Container status
docker compose ps

# Enter mail container
docker exec -it mailserver bash

# Check fail2ban
docker exec mailserver fail2ban-client status
```

## 📚 Documentation

- Full guide: `cloud/README.md`
- Backup info: `cloud/scripts/backup/README.md`
- Makefile commands: `make help`

---

**Need help?** Check the full README.md or Docker Mail Server docs: https://docker-mailserver.github.io
