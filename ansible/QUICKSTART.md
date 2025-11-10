# Quick Reference: Running Ansible Playbooks

## First Time Setup

1. **Install Ansible** (control machine only):
   ```bash
   sudo dnf install ansible  # Fedora
   ```

2. **Configure secrets**:
   ```bash
   cd ansible/
   cp .env.ansible.example .env.ansible
   # Edit .env.ansible with your values
   ```

3. **Load environment before EVERY playbook run**:
   ```bash
   set -a && source .env.ansible && set +a
   ```

## Common Commands

### Test Connection

```bash
ansible all -m ping
```

### Complete Setup (Fresh Server)

```bash
ansible-playbook site.yml -K
```

### Individual Playbooks

```bash
# Load environment first!
set -a && source .env.ansible && set +a

# Then run playbooks
ansible-playbook playbooks/initial-setup.yml -K
ansible-playbook playbooks/ssh-hardening.yml -K
ansible-playbook playbooks/fail2ban.yml -K
ansible-playbook playbooks/smart-monitoring.yml -K
ansible-playbook playbooks/backup-cronjob.yml -K
ansible-playbook playbooks/maintenance.yml -K
ansible-playbook playbooks/monitoring.yml -K
ansible-playbook playbooks/deploy.yml
```

### Deploy Services

```bash
set -a && source .env.ansible && set +a
ansible-playbook playbooks/deploy.yml
```

### Single Command to Run (Check First)

```bash
ansible all -m command -a "docker ps"
```

## Flags

- `-K` = Ask for sudo password (BECOME password)
- `-k` = Ask for SSH password (if no key)
- `-v` = Verbose output
- `-vvv` = Debug level output
- `--check` = Dry run (don't make changes)
- `--limit hostname` = Run only on specific host

## Troubleshooting

### Can't connect

```bash
ansible all -m ping -vvv
```

### Check syntax

```bash
ansible-playbook site.yml --syntax-check
```

### List tasks

```bash
ansible-playbook site.yml --list-tasks
```

### List hosts

```bash
ansible-playbook site.yml --list-hosts
```

## Important Notes

1. **Always load .env.ansible before running playbooks!**
   ```bash
   set -a && source .env.ansible && set +a
   ```

2. **SSH hardening warning**: Test SSH in new terminal before closing current
   one!

3. **No Ansible on server**: Only install Ansible on your control machine
   (laptop)

4. **Passwordless sudo**: Add `-K` flag or configure passwordless sudo on server

5. **Collection requirements**: If playbooks fail with "module not found":
   ```bash
   ansible-galaxy collection install community.general
   ansible-galaxy collection install community.docker
   ansible-galaxy collection install ansible.posix
   ```

## What Each Playbook Does

- **site.yml**: Runs everything (initial setup → hardening → monitoring)
- **initial-setup.yml**: Docker, Deno, essential tools
- **ssh-hardening.yml**: Secure SSH configuration
- **fail2ban.yml**: Brute force protection
- **smart-monitoring.yml**: SSD/NVMe health monitoring
- **backup-cronjob.yml**: Daily backup automation
- **maintenance.yml**: Updates, cleanup, log rotation
- **monitoring.yml**: Container health, disk space, service checks
- **deploy.yml**: Deploy Docker services

## Workflow

### Fresh Server

```bash
set -a && source .env.ansible && set +a
ansible-playbook site.yml -K
```

### Update Configuration

```bash
# Edit playbook files
ansible-playbook playbooks/specific-playbook.yml -K
```

### Deploy Services

```bash
set -a && source .env.ansible && set +a
ansible-playbook playbooks/deploy.yml
```

### Check Server Status

```bash
ansible all -m command -a "docker ps"
ansible all -m command -a "df -h"
ansible all -m command -a "systemctl status docker"
```
