# syntax=docker/dockerfile:1
# Build from our fork with MCP SDK 1.4.0 (Streamable HTTP transport)
# Upstream PR: https://github.com/barryw/ImmichMCP/pull/9

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

RUN apt-get update -qq && apt-get install -y -qq git && rm -rf /var/lib/apt/lists/*

ARG BRANCH=feat/rename-tools-underscores
RUN git clone --depth 1 --branch $BRANCH https://github.com/spy4x/ImmichMCP.git .

RUN dotnet restore ImmichMCP/ImmichMCP.csproj
WORKDIR /src/ImmichMCP
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

RUN apt-get update -qq && apt-get install -y -qq curl && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:5000
ENV MCP_PORT=5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

USER 1654
EXPOSE 5000
ENTRYPOINT ["dotnet", "ImmichMCP.dll"]
