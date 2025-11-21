# Hetzner Cloud Mail Server Setup

Complete email server infrastructure running on Hetzner VPS with Docker Mail Server, webmail, and monitoring.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Server Provisioning](#server-provisioning)
- [DNS Configuration](#dns-configuration)
- [Installation Steps](#installation-steps)
- [Email Account Management](#email-account-management)
- [Connecting Services](#connecting-services)
- [Client Configuration](#client-configuration)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)

## 🏗️ Overview

### What's Included

- **Docker Mail Server (DMS)** - Full-featured email server with SMTP/IMAP
- **Rspamd** - Modern spam filtering and statistics
- **ClamAV** - Antivirus scanning
- **Fail2ban** - Brute force protection
- **Roundcube** - Modern webmail interface
- **Uptime Kuma** - Monitoring (monitors your home server too)
- **ntfy** - Notification service for alerts
- **Traefik** - Reverse proxy with automatic SSL

### Why Separate Cloud Server?

Running email on Hetzner VPS instead of home server provides:
- ✅ Better IP reputation (residential IPs often blocked)
- ✅ Port 25 access (ISPs often block it)
- ✅ Reverse DNS control
- ✅ Higher uptime guarantees
- ✅ Professional email infrastructure

## 📝 Prerequisites

### Before You Begin

1. **Hetzner Account** - Sign up at https://hetzner.com
2. **Domain Name** - `antonshubin.com` (already configured)
3. **DNS Access** - Cloudflare or domain registrar DNS management
4. **SSH Key** - For server access
5. **Local Environment** - Ansible installed on your machine

### Required Skills

- Basic Docker/Docker Compose knowledge
- DNS record management
- SSH and command line

## 🖥️ Server Provisioning

### Recommended Hetzner VPS

**Option 1: CPX11 (Recommended)**
- 2 vCPU (AMD)
- 2 GB RAM
- 40 GB SSD
- 20 TB traffic
- €4.51/month
- Location: Falkenstein or Nuremberg (Germany)

**Option 2: CX22 (More Power)**
- 2 vCPU (Intel/AMD)
- 4 GB RAM
- 40 GB SSD
- 20 TB traffic
- €8.59/month

### Create Server

1. **Log in to Hetzner Cloud Console**
   - Go to https://console.hetzner.cloud
   - Create new project: "Homelab Cloud"

2. **Add Server**
   ```
   Name: mail-server
   Location: Falkenstein (fsn1) or Nuremberg (nbg1)
   Image: Fedora 41 (or latest)
   Type: CPX11 or CX22
   SSH Key: Add your public key
   Networking: IPv4 + IPv6
   ```

3. **Note the IP Address**
   ```
   IPv4: xxx.xxx.xxx.xxx
   IPv6: xxxx:xxxx:xxxx:xxxx::1
   ```

4. **Configure Firewall (Hetzner Cloud Firewall)**
   ```
   Inbound Rules:
   - SSH (22) - Your IP only
   - HTTP (80) - All IPs
   - HTTPS (443) - All IPs
   - SMTP (25) - All IPs
   - SMTP Submission (587) - All IPs
   - SMTPS (465) - All IPs
   - IMAPS (993) - All IPs
   
   Outbound Rules:
   - Allow all
   ```

## 🌐 DNS Configuration

### Required DNS Records

Add these records to your DNS provider (Cloudflare/domain registrar):

#### 1. Mail Server (A Record)
```
Type: A
Name: mail
Value: <Hetzner VPS IPv4>
TTL: 3600
Proxy: OFF (important!)
```

#### 2. MX Record (Mail Exchange)
```
Type: MX
Name: @
Priority: 10
Value: mail.antonshubin.com
TTL: 3600
```

#### 3. SPF Record (Sender Policy Framework)
```
Type: TXT
Name: @
Value: v=spf1 mx ip4:<Hetzner-IPv4> ~all
TTL: 3600
```

#### 4. DMARC Record (Email Authentication)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:2spy4x@gmail.com; ruf=mailto:2spy4x@gmail.com; fo=1
TTL: 3600
```

#### 5. DKIM Record (Generated After Setup)
**⚠️ Add this AFTER deploying mail server** (see [DKIM Setup](#dkim-setup))
```
Type: TXT
Name: mail._domainkey
Value: <will be generated - see below>
TTL: 3600
```

#### 6. Reverse DNS (PTR Record)
**Configure in Hetzner Console:**
1. Go to your server → Networking → IPv4
2. Click "Edit Reverse DNS"
3. Set to: `mail.antonshubin.com`
4. Save

#### 7. Service Subdomains (Optional Web Interfaces)
```
# Webmail
Type: A
Name: webmail
Value: <Hetzner VPS IPv4>
TTL: 3600

# Monitoring
Type: A
Name: monitor
Value: <Hetzner VPS IPv4>
TTL: 3600

# Notifications
Type: A
Name: notify
Value: <Hetzner VPS IPv4>
TTL: 3600

# Rspamd (spam filter UI)
Type: A
Name: rspamd
Value: <Hetzner VPS IPv4>
TTL: 3600

# Traefik proxy dashboard
Type: A
Name: proxy
Value: <Hetzner VPS IPv4>
TTL: 3600
```

### DNS Propagation Check

Wait 5-60 minutes for DNS to propagate, then verify:

```bash
# Check A record
dig mail.antonshubin.com +short

# Check MX record
dig antonshubin.com MX +short

# Check SPF
dig antonshubin.com TXT +short | grep spf

# Check reverse DNS
dig -x <Hetzner-IPv4> +short
```

## 🚀 Installation Steps

### Step 1: Update Ansible Inventory

Edit `ansible/inventory.yml` and add cloud server:

```yaml
all:
  children:
    homelab_servers:
      hosts:
        home_server:
          ansible_host: spy4x-server-mini-pc-external
          ansible_user: spy4x
          homelab_user: spy4x
          apps_path: ~/ssd-2tb/apps
          env_file_path: ~/ssd-2tb/apps/.env
          deno_install_path: ~/.deno
    
    cloud_servers:
      hosts:
        hetzner_mail:
          ansible_host: <Hetzner-VPS-IP>
          ansible_user: root
          homelab_user: cloud
          apps_path: /opt/cloud
          env_file_path: /opt/cloud/.env
          deno_install_path: /home/cloud/.deno
```

### Step 2: Initial Server Setup

Run Ansible playbook for system configuration:

```bash
cd ansible
ansible-playbook cloud/playbooks/initial-setup.yml
```

This installs:
- Docker & Docker Compose
- Essential tools (htop, vim, curl, etc.)
- Creates directory structure
- Configures firewall

### Step 3: Prepare Configuration

1. **Copy environment file:**
   ```bash
   cp cloud/.env.example cloud/.env
   ```

2. **Edit `cloud/.env`:**
   ```bash
   nano cloud/.env
   ```
   
   Update these values:
   ```env
   PROJECT=cloud
   DOMAIN=antonshubin.com
   CONTACT_EMAIL=2spy4x@gmail.com
   TIMEZONE=Asia/Singapore
   
   # Generate basic auth password:
   # echo $(htpasswd -nb spy4x YourPassword) | sed 's/\$/\$\$/g'
   BASIC_AUTH_USER=spy4x
   BASIC_AUTH_PASSWORD=$$apr1$$...$$...
   
   # SMTP credentials (set after creating email account)
   SMTP_HOST=mail.antonshubin.com
   SMTP_PORT=587
   SMTP_FROM=noreply@antonshubin.com
   SMTP_USERNAME=noreply@antonshubin.com
   SMTP_PASSWORD=<will-be-set-later>
   ```

### Step 4: Deploy Services

Deploy via Ansible:

```bash
cd ansible
ansible-playbook cloud/playbooks/deploy.yml
```

Or manually via SSH:

```bash
ssh root@<Hetzner-IP>
cd /opt/cloud
make setup    # Create Docker network
make deploy   # Start all services
```

### Step 5: Verify Services

Check all containers are running:

```bash
ssh root@<Hetzner-IP>
cd /opt/cloud
docker compose ps
```

Expected output:
```
NAME           STATUS    PORTS
mailserver     Up        25, 465, 587, 993
webmail        Up        
proxy          Up        80, 443
uptime-kuma    Up
ntfy           Up
watchtower     Up
```

### Step 6: DKIM Setup

Generate and configure DKIM for email signing:

```bash
# On Hetzner server
cd /opt/cloud
make mail-dkim-show
```

This outputs something like:
```
v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
```

**Add to DNS:**
```
Type: TXT
Name: mail._domainkey
Value: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
TTL: 3600
```

**Verify after 5 minutes:**
```bash
dig mail._domainkey.antonshubin.com TXT +short
```

## 📧 Email Account Management

### Create Email Accounts

```bash
# SSH to Hetzner server
ssh root@<Hetzner-IP>
cd /opt/cloud

# Add primary email account
make mail-user-add EMAIL=anton@antonshubin.com
# Enter password when prompted

# Add noreply account (for automated emails)
make mail-user-add EMAIL=noreply@antonshubin.com
# Enter password and save it to .env as SMTP_PASSWORD

# Add more accounts
make mail-user-add EMAIL=family@antonshubin.com
```

### Email Aliases

Forward emails from one address to another:

```bash
# info@ goes to anton@
make mail-alias-add ALIAS=info@antonshubin.com TARGET=anton@antonshubin.com

# postmaster@ goes to anton@
make mail-alias-add ALIAS=postmaster@antonshubin.com TARGET=anton@antonshubin.com

# admin@ goes to anton@
make mail-alias-add ALIAS=admin@antonshubin.com TARGET=anton@antonshubin.com
```

### Manage Accounts

```bash
# List all email accounts
make mail-user-list

# Delete an account
make mail-user-del EMAIL=olduser@antonshubin.com

# Check mail server configuration
make mail-check-config

# View debug information
make mail-debug
```

## 🔌 Connecting Services

### Update Vaultwarden (on Singapore Server)

Configure Vaultwarden to send emergency emails via your mail server.

**Edit `/home/spy4x/ssd-2tb/apps/.env`:**

```env
# SMTP Configuration for Vaultwarden
SMTP_HOST=mail.antonshubin.com
SMTP_PORT=587
SMTP_FROM=noreply@antonshubin.com
SMTP_USERNAME=noreply@antonshubin.com
SMTP_PASSWORD=<password-from-noreply-account>
```

**Update `server/compose.yml`:**

```yaml
vaultwarden:
  environment:
    # ... existing vars ...
    - SMTP_HOST=${SMTP_HOST}
    - SMTP_FROM=${SMTP_FROM}
    - SMTP_PORT=${SMTP_PORT}
    - SMTP_SECURITY=starttls
    - SMTP_USERNAME=${SMTP_USERNAME}
    - SMTP_PASSWORD=${SMTP_PASSWORD}
```

**Redeploy Vaultwarden:**

```bash
cd ~/ssd-2tb/apps
docker compose up -d vaultwarden
```

### Other Services

Any service that needs SMTP can use:
- **Host:** `mail.antonshubin.com`
- **Port:** `587`
- **Security:** STARTTLS
- **Username:** `noreply@antonshubin.com`
- **Password:** (from .env)

## 📱 Client Configuration

### Thunderbird (Desktop)

**Email Account:**
1. Edit → Account Settings → Account Actions → Add Mail Account
2. Your name: Anton Shubin
3. Email: anton@antonshubin.com
4. Password: (your password)
5. Manual config:
   ```
   Incoming: IMAP
   Server: mail.antonshubin.com
   Port: 993
   SSL: SSL/TLS
   Auth: Normal password
   
   Outgoing: SMTP
   Server: mail.antonshubin.com
   Port: 587
   SSL: STARTTLS
   Auth: Normal password
   Username: anton@antonshubin.com
   ```

### Android/iOS Mail Apps

**Generic IMAP/SMTP:**
```
Incoming (IMAP):
  Server: mail.antonshubin.com
  Port: 993
  Security: SSL/TLS
  Username: anton@antonshubin.com
  Password: your-password

Outgoing (SMTP):
  Server: mail.antonshubin.com
  Port: 587
  Security: STARTTLS
  Username: anton@antonshubin.com
  Password: your-password
```

### Roundcube Webmail

Access at: **https://webmail.antonshubin.com**

1. Username: `anton@antonshubin.com`
2. Password: (your password)
3. Login

Features:
- Send/receive emails
- Manage folders
- Address book
- Sieve filters (server-side rules)

## 📊 Monitoring & Maintenance

### Access Web Interfaces

- **Webmail:** https://webmail.antonshubin.com
- **Rspamd (Spam Filter):** https://rspamd.antonshubin.com (requires basic auth)
- **Uptime Kuma:** https://monitor.antonshubin.com
- **Traefik Dashboard:** https://proxy.antonshubin.com (requires basic auth)
- **Notifications:** https://notify.antonshubin.com

### Monitor Mail Server Health

```bash
ssh root@<Hetzner-IP>
cd /opt/cloud

# Check container status
make status

# View logs
make logs

# Health check
make health

# Check mail queue
docker exec mailserver postqueue -p
```

### Uptime Kuma Setup

Configure monitoring for both cloud and home services:

1. Access https://monitor.antonshubin.com
2. Create admin account
3. Add monitors:
   ```
   - Home server: https://ui.antonshubin.com
   - Vaultwarden: https://passwords.antonshubin.com
   - Jellyfin: https://movies.antonshubin.com
   - SMTP: mail.antonshubin.com:587
   - IMAP: mail.antonshubin.com:993
   ```

### Email Testing

Test your mail server configuration:

```bash
# Test SMTP
telnet mail.antonshubin.com 587

# Test email deliverability
# Send test email to: check-auth@verifier.port25.com
# You'll receive a report of your SPF/DKIM/DMARC setup

# Check mail server reputation
# Visit: https://www.mail-tester.com
# Send email to provided address
# Check your score (aim for 10/10)
```

### Backup Configuration

The mail server data is stored in `.volumes/mailserver/`:
- `mail-data/` - All emails
- `mail-state/` - Rspamd, fail2ban, etc.
- `config/` - User accounts, aliases

**Backup script** is at `cloud/scripts/backup/+main.ts` (similar to home server).

Run backups:
```bash
cd /opt/cloud
deno run --allow-all scripts/backup/+main.ts
```

Configure cron (via Ansible):
```bash
ansible-playbook cloud/playbooks/backup-cronjob.yml
```

## 🔧 Troubleshooting

### Common Issues

#### 1. DNS not resolving
```bash
# Check DNS propagation
dig mail.antonshubin.com +short
dig antonshubin.com MX +short

# Wait up to 1 hour for DNS to propagate globally
```

#### 2. Can't send emails
```bash
# Check SMTP logs
docker logs mailserver | grep -i error

# Verify SPF/DKIM/DMARC
dig antonshubin.com TXT +short
dig mail._domainkey.antonshubin.com TXT +short

# Test from mail-tester.com
```

#### 3. Emails going to spam
- Verify DKIM is set up correctly
- Check SPF record includes your server IP
- Verify reverse DNS (PTR record)
- Send test to mail-tester.com for detailed report
- Warm up your IP (send gradually increasing volume)

#### 4. Can't receive emails
```bash
# Check MX record
dig antonshubin.com MX +short

# Check if port 25 is accessible
telnet mail.antonshubin.com 25

# Check mail logs
docker logs mailserver | grep -i "postfix"
```

#### 5. Container won't start
```bash
# Check logs
docker logs mailserver

# Common fix: ensure proper permissions
ssh root@<Hetzner-IP>
chown -R 5000:5000 /opt/cloud/.volumes/mailserver/mail-data
chown -R 5000:5000 /opt/cloud/.volumes/mailserver/mail-state

# Restart
cd /opt/cloud
make restart
```

### Debug Commands

```bash
# Enter mail server container
docker exec -it mailserver bash

# Check postfix status
docker exec mailserver postfix status

# View mail queue
docker exec mailserver postqueue -p

# Test Rspamd
docker exec mailserver rspamc stat

# Check fail2ban
docker exec mailserver fail2ban-client status

# Reload configuration
docker exec mailserver supervisorctl restart all
```

### Get Help

- **Docker Mail Server Docs:** https://docker-mailserver.github.io/docker-mailserver/latest/
- **Rspamd Docs:** https://rspamd.com/doc/
- **Check logs:** `make logs`
- **Health check:** `make health`

## 📚 Additional Resources

### Email Best Practices

1. **Warm up your IP** - Gradually increase sending volume
2. **SPF/DKIM/DMARC** - Always properly configured
3. **Monitor reputation** - Use tools like:
   - https://www.mail-tester.com
   - https://mxtoolbox.com/blacklists.aspx
4. **Keep software updated** - Watchtower handles this
5. **Regular backups** - Automated via cron

### Security Recommendations

1. **Strong passwords** - Use password manager
2. **2FA where possible** - Enable in Roundcube
3. **Firewall rules** - Only necessary ports open
4. **Fail2ban** - Monitors and blocks brute force
5. **Regular updates** - Check `docker compose pull` monthly
6. **Monitor logs** - Watch for suspicious activity

## 🎯 Next Steps

1. ✅ Set up DNS records
2. ✅ Deploy mail server
3. ✅ Create email accounts
4. ✅ Configure DKIM
5. ✅ Test email sending/receiving
6. ✅ Connect Vaultwarden
7. ✅ Set up monitoring
8. ✅ Configure backups
9. 📧 Start using your email!

---

**Deployment Date:** 2025-11-12  
**Maintained by:** Anton Shubin (@spy4x)  
**Server Location:** Hetzner Falkenstein/Nuremberg, Germany
