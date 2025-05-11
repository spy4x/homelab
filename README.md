# Homelab Server

This repository contains the configuration and setup for my homelab servers. The services are now organized into **Primary** and **Secondary** servers, each with its own folder for better management.
It's pretty lightweight and you can run it on a Raspberry Pi or any other server.
Only thing you need is [Docker](https://get.docker.com/) installed and running.

## Services

### Primary Server

#### [Traefik](https://github.com/traefik/traefik)

A reverse proxy that routes incoming requests to the correct container by domain name. It also handles SSL certificates with Let's Encrypt.

#### [Uptime Kuma](https://github.com/louislam/uptime-kuma)

A monitoring tool to check the status of websites and APIs.

#### [Transmission](https://github.com/transmission/transmission)

A lightweight BitTorrent client with a web interface.

#### [Jellyfin](https://github.com/jellyfin/jellyfin)

A media server for hosting and managing personal media libraries.

#### [Vaultwarden](https://github.com/dani-garcia/vaultwarden)

A password manager compatible with Bitwarden clients.

#### [Watchtower](https://github.com/containrrr/watchtower)

Automates updating Docker containers to the latest version.

#### [Homepage](./homepage/src/index.html)

A simple homepage with links to all the services.

#### [WireGuard](https://www.wireguard.com/)

A modern VPN server that is easy to set up and very fast.

#### [Syncthing](https://syncthing.net/)

A continuous file synchronization program.

#### [Shadowbox (Outline VPN)](https://github.com/Jigsaw-Code/outline-server)

A self-hosted VPN solution that integrates Shadowsocks.

#### [Open WebUI](https://github.com/open-webui/open-webui)

An AI-powered web interface for various backend services.

### Secondary Server

The secondary server contains additional services and configurations. Refer to the `secondary/compose.yml` file for details.

## Setup

### 1. Create the `.env` File

Copy the example `.env` file and fill in the required variables:

```bash
cp .env.example .env
```

### 2. Deploy the Stack

Run the following command to deploy the stack:

```bash
make deploy
```

### 3. Access the Services

Access the services using the domain names specified in the `.env` file.

### 4. Add More Services

To add more services, edit the `compose.yml` file and run `make deploy` again.

## Notes

- Ensure Docker is installed and configured to run as a non-root user.
- Use the `backup/` folder for managing backups.
- Check logs for troubleshooting if any service fails to start.
