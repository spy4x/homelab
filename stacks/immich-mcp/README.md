# Immich MCP

MCP server for Immich photo management. Connects AI assistants (Open WebUI) to your Immich library.

## Features

- **Search**: Smart semantic search (CLIP), metadata search, explore
- **Assets**: List, get, upload, update, delete photos/videos
- **Albums**: Create, manage, share albums
- **People**: View and manage face recognition clusters
- **Tags**: Organize assets with custom tags
- **Shared Links**: Create shareable URLs

## Security Notes

- Runs on Docker internal `proxy` network only (no public ports)
- Uses no-new-privileges security opt
- MCP HTTP endpoint has NO auth — accessible only from Docker network
- Immich API key stored in `.env` (encrypted as `.env.age`)

## API Key Setup

Requires a dedicated Immich API key. Create one:

1. Go to Immich web UI (photos.antonshubin.com) → Settings → API Keys
2. Create a new key named `immich-mcp`
3. Add to `servers/home/.env`:
   ```
   IMMICH_MCP_API_KEY=<key>
   ```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `IMMICH_MCP_API_KEY` | Yes | Immich API key (dedicated) |

## Tools Exposed via MCP

- `immich.ping` — Verify connectivity
- `immich.assets.list` — List recent assets
- `immich.assets.get` — Get asset metadata
- `immich.assets.search.smart` — ML semantic search
- `immich.albums.list` — List albums
- `immich.albums.create` — Create album
- `immich.people.list` — List recognized people
- `immich.tags.list` — List tags
- `immich.shared_links.create` — Create shared link
