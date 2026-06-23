# MCP Google Maps server — Node 20 alpine
# Pin to a specific release tag for reproducibility. Build arg defaults in compose.yml.

ARG NODE_VERSION=20-alpine
FROM node:${NODE_VERSION} AS builder

ARG MCP_GOOGLE_MAP_VERSION=v0.0.52
WORKDIR /build

# Clone at the exact release tag (no shallow clone — we want the tag ref).
RUN apk add --no-cache git \
  && git clone --depth 1 --branch ${MCP_GOOGLE_MAP_VERSION} \
     https://github.com/cablate/mcp-google-map.git . \
  && npm ci \
  && npm run build

# --- Runtime image ---
FROM node:${NODE_VERSION}

WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 3000

# Streamable HTTP server on port 3000. Configurable via env.
CMD ["node", "dist/cli.js", "--host", "0.0.0.0", "--port", "3000"]
