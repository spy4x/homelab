# SearXNG

Privacy-respecting metasearch engine. Aggregates results from multiple search engines.

## Access

- Web UI: `https://search.${DOMAIN}`
- JSON API: `http://searxng:8080/search?format=json` (internal, for OpenWebUI)

## Integration with OpenWebUI

OpenWebUI searches via SearXNG internally. Set in OpenWebUI env:

- `ENABLE_WEB_SEARCH=true`
- `WEB_SEARCH_ENGINE=searxng`
- `SEARXNG_QUERY_URL=http://searxng:8080/search?format=json`

## Configuration

Settings are in `${VOLUMES_PATH}/searxng/settings/settings.yml`.
Generated from `searxng-settings.yml` template during deployment.

## Search Engines Enabled

- DuckDuckGo, Google, Bing
- Wikipedia, StackOverflow, GitHub, Reddit
- Google Images, Google News
