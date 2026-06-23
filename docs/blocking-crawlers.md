# Blocking Crawlers on Self-Hosted Services

## Goal

Stop Google, Bing, AI scrapers, and random bots from indexing your
self-hosted services (CalDAV, Immich, Jellyfin, Transmission, etc.)
while keeping public-facing sites (antonshubin.com) discoverable for SEO.

## Approach: X-Robots-Tag header + per-site robots.txt

We use **two layers** because they cover different crawlers:

1. **`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`** HTTP header.
   Sent on every response by the global `security-headers` Traefik
   middleware. Honored by Google, Bing, DuckDuckGo, GPTBot, ClaudeBot,
   CCBot, anthropic-ai, perplexity, Applebot, and most major crawlers.

2. **`robots.txt` static file** on a per-site basis. Honored by crawlers
   that check for it (most search engines do). Easy to override per
   service.

X-Robots-Tag is the load-bearing mechanism because it travels with every
HTTP response. Crawlers cannot ignore it by simply not fetching
`/robots.txt`. robots.txt is a secondary signal — defensive in depth, but
not reliable against malicious scrapers.

## What is blocked

The X-Robots-Tag is set by the default `security-headers@file` middleware
in `stacks/traefik/dynamic.yml`. That middleware is applied automatically
to every router on the `websecure` entrypoint (per the
`--entrypoints.websecure.http.middlewares=security-headers@file,compression@file`
flag in `stacks/traefik/compose.yml`).

**Result**: every Traefik-served service on `*.antonshubin.com` and
`*.neatsoft.dev` (except antonshubin.com root) gets the
`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` header on every
response.

## What is NOT blocked

### antonshubin.com (root)

The public portfolio. We want it indexed. Override:

```yaml
# stacks/antonshubincom/.../compose.yml (or wherever it lives)
labels:
  - "traefik.http.routers.<router>.middlewares=...,allow-index@file"
```

The `allow-index@file` middleware (defined in
`stacks/traefik/dynamic.yml`) sends an empty `X-Robots-Tag: ""` header,
which suppresses the deny. The site is then indexable.

antonshubin.com also serves its own `/robots.txt` at
`routes/robots.txt.ts` (allows everything, including AI crawlers — this
is intentional for the personal brand).

### neatsoft.dev

The B2B agency site. Blocked by default (via X-Robots-Tag). Also gets a
deny `/robots.txt` from `servers/cloud/configs/neatsoft-landing/robots.txt`.

If you ever want to index neatsoft.dev for SEO, swap the robots.txt to
`Allow: /` and add `allow-index@file` to its Traefik labels.

## Cloudflare-level protection (optional belt-and-suspenders)

Cloudflare has a "Block AI Bots / Crawlers" toggle under
**Security → Bots** that blocks GPTBot, ClaudeBot, etc. before they
even reach your origin. Recommended for a defense-in-depth setup.

## Per-service exceptions

Some services are public-by-design and might want indexing. To allow a
specific service to be indexed:

```yaml
# in that service's compose.yml
labels:
  - "traefik.http.routers.<router>.middlewares=...,allow-index@file"
```

Examples where this might be needed:
- A blog at `blog.${DOMAIN}`
- A documentation site at `docs.${DOMAIN}`
- A landing page

Currently, all self-hosted services in this repo inherit the
`security-headers@file` middleware, which means they are all
`X-Robots-Tag: noindex, nofollow` by default. Add the `allow-index@file`
override per-router to whitelist.

## Verifying

```bash
# Test the header is set
curl -sI https://photos.antonshubin.com | grep -i x-robots
# Expected: X-Robots-Tag: noindex, nofollow, noarchive, nosnippet

# Test the override on antonshubin.com root
curl -sI https://antonshubin.com | grep -i x-robots
# Expected: X-Robots-Tag:    (empty / blank)

# Test robots.txt for neatsoft
curl -s https://neatsoft.dev/robots.txt
# Expected: User-agent: *\nDisallow: /
```

## References

- [Google: Robots meta tag and X-Robots-Tag HTTP header specifications](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Cloudflare AI crawler protection](https://blog.cloudflare.com/announcing-ai-bots-and-crawlers-protection/)
- [Traefik headers middleware](https://doc.traefik.io/traefik/middlewares/http/headers/)
