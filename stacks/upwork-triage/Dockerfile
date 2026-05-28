# ── Stage 1: Build webui ──
FROM node:22-alpine AS webui
WORKDIR /app
COPY webui/package.json webui/package-lock.json ./
RUN npm ci
COPY webui/ ./
RUN npm run build

# ── Stage 2: Deno backend ──
FROM denoland/deno:alpine
WORKDIR /app
COPY deno.jsonc ./
COPY types.ts evaluator.ts notifier.ts +main.ts ./
RUN deno cache +main.ts
COPY prompt.txt ./
COPY --from=webui /app/dist ./webui
EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "+main.ts"]
