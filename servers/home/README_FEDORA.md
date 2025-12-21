# Fedora Server Docker Networking Fix

This document contains instructions to fix Docker external networking issues on Fedora Server 42 (and potentially later versions).

## Problem Description

After migrating from Ubuntu to Fedora Server 42, Docker containers running behind Traefik reverse proxy become inaccessible from external networks, even though:

- SSH access works fine
- Local requests to `localhost:80/443` work
- Docker containers are running properly
- Port forwarding rules are correct
- DNS configuration is correct

**Root Cause:** Fedora 42's transition to nftables creates conflicts with Docker's iptables rules. The `DOCKER-USER` chain remains empty, causing external traffic to be dropped in the FORWARD chain even though NAT rules work correctly.

## Symptoms

- `curl -I -H "Host: movies.antonshubin.com" http://localhost` ✅ Works
- `curl -I -H "Host: movies.antonshubin.com" http://YOUR_PUBLIC_IP` ❌ Fails
- Docker logs show no incoming requests from external sources
- `iptables -t nat -L` shows traffic hitting DNAT rules (packet counters > 0)
- `iptables -L` shows DOCKER chain rules exist but have 0 packet counters

## Solution

### Step 1: Apply Immediate Fix

```bash
# Add rule to allow external traffic through Docker
sudo iptables -I DOCKER-USER -j ACCEPT
```

Test immediately:

```bash
curl -I http://YOUR_DOMAIN_OR_IP
```

### Step 2: Make Fix Permanent

Create a systemd service to automatically apply the rule on every boot:

```bash
sudo tee /etc/systemd/system/docker-external-access.service << 'EOF'
[Unit]
Description=Allow external access to Docker containers
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/sbin/iptables -I DOCKER-USER -j ACCEPT
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
```

Enable the service:

```bash
sudo systemctl enable docker-external-access.service
```

### Step 3: Alternative - Using Firewalld (if you re-enable it)

If you decide to re-enable firewalld later:

```bash
# Start and enable firewalld
sudo systemctl enable --now firewalld

# Add the Docker rule permanently to firewalld
sudo firewall-cmd --permanent --direct --add-rule ipv4 filter DOCKER-USER 0 -j ACCEPT

# Reload firewalld configuration
sudo firewall-cmd --reload
```

## Verification

Test external connectivity:

```bash
# Test HTTP (should redirect to HTTPS)
curl -v http://YOUR_DOMAIN

# Test HTTPS
curl -I https://YOUR_DOMAIN
```

Check Docker logs to confirm requests are reaching Traefik:

```bash
docker logs traefik --tail 50
```

## Troubleshooting

### Check if the rule is applied:

```bash
sudo iptables -L DOCKER-USER -v
```

You should see:

```
Chain DOCKER-USER (1 references)
 pkts bytes target     prot opt in     out     source               destination
   XX  XXXX ACCEPT     all  --  any    any     anywhere             anywhere
```

### Check NAT rules are working:

```bash
sudo iptables -t nat -L DOCKER -v
```

Look for your container's DNAT rules with packet counters > 0.

### Check nftables (informational):

```bash
sudo nft list table ip filter
sudo nft list table ip nat
```

## Background Information

- **Issue**: Fedora 42+ uses nftables instead of traditional iptables
- **Docker**: Still uses iptables-nft (iptables commands translated to nftables)
- **Conflict**: Empty DOCKER-USER chain causes traffic to be dropped
- **Solution**: Explicitly allow traffic through DOCKER-USER chain

## Related Links

- [Docker causing errors in firewall startup - Fedora Discussion](https://discussion.fedoraproject.org/t/docker-causing-errors-in-firewall-startup/93920/6)
- [Docker Network packet filtering firewalls documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- [Why is firewalld allowing public traffic to my non-public ports bound to docker](https://serverfault.com/questions/1077849/why-is-firewalld-allowing-public-traffic-to-my-non-public-ports-bound-to-docker)
- [Docker stopped working after update to Fedora 42](https://forums.docker.com/t/docker-stopped-working-after-update-to-fedora-42/147915/4)

## Notes

- This fix is specific to Fedora Server 42's nftables/Docker interaction
- The issue occurs even with firewalld disabled
- Local Docker networking continues to work normally
- This does not affect container-to-container communication
- Only external-to-container traffic is affected

---

_Last updated: August 5, 2025_
_Fedora Server 42, Docker 28.3.3_
