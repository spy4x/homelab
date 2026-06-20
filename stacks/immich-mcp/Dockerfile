FROM ghcr.io/barryw/immichmcp:latest

USER root
RUN apt-get update -qq && apt-get install -y -qq curl && rm -rf /var/lib/apt/lists/*
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

USER 1654
