# Jitsi Meet

Jitsi Meet is a self-hosted video conferencing solution.

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Generate secure secrets:
   ```bash
   # Generate 5 random secrets
   for i in {1..5}; do openssl rand -hex 32; done
   ```

3. Edit `.env` and replace all `change_this_*` placeholders with the generated
   secrets.

4. Start the services:
   ```bash
   docker-compose up -d
   ```

5. Access at https://meeting.${DOMAIN}

## Router Configuration

**IMPORTANT**: You must forward UDP port 10000 on your router to your server's
IP address.

- Protocol: UDP
- External Port: 10000
- Internal Port: 10000
- Internal IP: Your server's local IP

Without this, video/audio calls will fail or have poor quality.

## Configuration

- Edit `.env` to customize settings
- Volumes are stored in `./.volumes/`
- The service integrates with Traefik for HTTPS

## Features Enabled

- Guest access (no authentication required)
- Lobby (wait for moderator)
- Breakout rooms
- Pre-join page
- P2P mode for 2-person calls
- WebSocket for better performance

## Troubleshooting

If calls don't connect:

1. Check if port 10000/UDP is forwarded on your router
2. Check logs: `docker-compose logs -f jvb`
3. Test WebRTC: https://test.webrtc.org/
