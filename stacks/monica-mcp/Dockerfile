# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install git for cloning
RUN apk add --no-cache git

# Clone monica-mcp at pinned commit (v0.1.0 checkout)
# Use commit from main branch as of 2025
ARG MONICA_MCP_COMMIT=788da8591ccd5603b40f78e67f61cd4d27563cc9

RUN git clone https://github.com/Jacob-Stokes/monica-mcp.git . \
  && git checkout ${MONICA_MCP_COMMIT}

# Install dependencies and build
RUN npm ci && npm run build

# Copy the HTTP wrapper over the built dist
COPY http-wrapper.mjs /app/http-wrapper.mjs

# Runtime stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy built artifacts + wrapper
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/http-wrapper.mjs ./http-wrapper.mjs

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

ENV MCP_PORT=3000
ENV MONICA_BASE_URL=https://crm.antonshubin.com
ENV MONICA_TOKEN_TYPE=bearer

CMD ["node", "http-wrapper.mjs"]
