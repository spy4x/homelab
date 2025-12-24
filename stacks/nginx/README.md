# Nginx

Generic Nginx web server for serving static content.

## Overview

This stack provides a lightweight Nginx container that can be deployed multiple times on the same server using the `deployAs` feature in `config.json`. It's commonly used for:
- Static website hosting
- Dashboard/homepage
- Landing pages
- HTML documentation

## Features

- Alpine-based image (minimal footprint)
- Read-only volume mount for security
- Traefik integration for automatic SSL
- Resource-limited (128M RAM, 0.10 CPU)

## Configuration

### Basic Deployment

Add to `servers/{server}/config.json`:
```json
{
  "stacks": [
    {"name": "nginx", "deployAs": "homepage"}
  ]
}
```

### Multiple Deployments

Deploy the same nginx stack multiple times:
```json
{
  "stacks": [
    {"name": "nginx", "deployAs": "homepage"},
    {"name": "nginx", "deployAs": "blog"},
    {"name": "nginx", "deployAs": "docs"}
  ]
}
```

### Content

Place your HTML/CSS/JS files in `servers/{server}/configs/{deployAs}/src/`:
```
servers/home/configs/homepage/src/
├── index.html
├── style.css
└── assets/
```

### Server-Specific Setup

For dynamic content generation (like the homepage), add a `before.deploy.ts` script:
```
servers/{server}/configs/{deployAs}/before.deploy.ts
```

This script runs before deployment and can generate HTML from templates, fetch data, etc.

## Environment Variables

No environment variables required - fully configured via compose file and Traefik labels.

## Access

Service is available at: `https://{deployAs}.${DOMAIN}`

Example: `https://homepage.example.com`

## Notes

- Content is mounted read-only for security
- Container name becomes `{deployAs}` (e.g., `homepage`)
- Each deployment needs unique subdomain configured in Traefik rules
- No persistent data beyond the mounted content directory
