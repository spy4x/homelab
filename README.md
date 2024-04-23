# Homelab server

This is a collection of services I run on my homelab server.  
It's pretty lightweight (you need at least 2GB RAM) and easy to setup.  
All you need is a linux server with [Docker](https://get.docker.com/) installed.  
Make sure you followed instructions after installation to configure to run Docker as a non-root user.

## Services

### [Traefik](https://github.com/traefik/traefik)
A reverse proxy that is used to route incoming requests to the correct container by domain name and not by port.  
It's configured to use Let's Encrypt to automatically generate SSL certificates and redirect all HTTP requests to HTTPS.  
Ex: https://movies.example.com -> jellyfin container:8096  
Ex: https://gitea.example.com -> gitea container:3000  

### [Uptime Kuma](https://github.com/louislam/uptime-kuma)
Uptime Kuma is a monitoring tool, that checks the status of your websites and APIs.

### [Transmission](https://github.com/transmission/transmission)
Transmission is a BitTorrent client with a web interface.  
It is a lightweight, works on the server in background and has zero configuration.

### [Jellyfin](https://github.com/jellyfin/jellyfin)
Jellyfin is a media server for hosting and managing personal media libraries.  
Think of movies, TV shows, home videos, music, and pictures.

### [Gitea](https://github.com/go-gitea/gitea)
Gitea is a lightweight self-hosted Git service, similar to GitHub.

### [Immich](https://immich.app/)
Google Photos self-hosted alternative.

### [Vaultwarden](https://github.com/dani-garcia/vaultwarden)
Password Manager, Bitwarden-compatible server written in Rust.

### [Watchtower](https://github.com/containrrr/watchtower)
Watchtower automates updating your docker containers to the latest version.

### [Homepage](./homepage/src/index.html)
A simple homepage with links to all the services.

### [wireguard](https://www.wireguard.com/)
WireGuard is a modern VPN server that is easy to setup and very fast.

## Setup
To start you need to create .env file by copying .env.example:
```bash
cp .env.example .env
```
and filling in the variables.  

Then you can deploy the stack to your server:
```bash
make deploy
```

That's it! You can now access the services by going to the domain names you specified in the .env file.  
If you want to add more services, just add them to the `compose.yml` file and run `make deploy` again.
