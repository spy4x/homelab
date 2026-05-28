# ── Stage 1: Build webui (Deno-native, no Node.js) ──
FROM denoland/deno:alpine AS webui
WORKDIR /app/webui
COPY webui/ ./
# cache first for layer caching, then build
RUN deno cache +build.ts && deno run -A +build.ts

# ── Stage 2: Deno backend ──
FROM denoland/deno:alpine
WORKDIR /app
COPY deno.jsonc ./
COPY types.ts evaluator.ts notifier.ts +main.ts ./
RUN deno cache +main.ts
COPY prompt.txt ./
COPY --from=webui /app/webui/dist ./webui
EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "+main.ts"]
