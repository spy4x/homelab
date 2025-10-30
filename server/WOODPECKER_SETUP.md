# Woodpecker CI Setup Guide

Woodpecker CI is now added to your homelab! Follow these steps to get it
running.

## Prerequisites

- A Git provider account (GitHub, Gitea, or GitLab)
- Access to your homelab server

## Setup Steps

### 1. Generate Agent Secret

Generate a secure random secret for agent authentication:

```bash
openssl rand -hex 32
```

### 2. Configure OAuth Application

Choose one of the following based on your Git provider:

#### Option A: GitHub

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Woodpecker CI
   - **Homepage URL**: `https://ci.yourdomain.com` (replace with your actual
     domain)
   - **Authorization callback URL**: `https://ci.yourdomain.com/authorize`
4. Save the **Client ID** and **Client Secret**

#### Option B: Gitea

1. Go to your Gitea instance → Settings → Applications
2. Create new OAuth2 Application
3. Fill in:
   - **Application Name**: Woodpecker CI
   - **Redirect URI**: `https://ci.yourdomain.com/authorize`
4. Save the **Client ID** and **Client Secret**

#### Option C: GitLab

1. Go to https://gitlab.com/-/profile/applications (or your GitLab instance)
2. Create new application
3. Fill in:
   - **Name**: Woodpecker CI
   - **Redirect URI**: `https://ci.yourdomain.com/authorize`
   - **Scopes**: Select `api`, `read_user`, `read_repository`
4. Save the **Application ID** and **Secret**

### 3. Update Environment Variables

Add these variables to your `.env` file in the server directory:

```bash
# Required for all setups
WOODPECKER_AGENT_SECRET=<your-generated-secret-from-step-1>
WOODPECKER_ADMIN=<your-git-username>

# For GitHub (default in compose.yml)
WOODPECKER_GITHUB_CLIENT=<your-github-client-id>
WOODPECKER_GITHUB_SECRET=<your-github-client-secret>

# OR for Gitea (uncomment Gitea section in compose.yml)
# WOODPECKER_GITEA_URL=https://gitea.yourdomain.com
# WOODPECKER_GITEA_CLIENT=<your-gitea-client-id>
# WOODPECKER_GITEA_SECRET=<your-gitea-client-secret>

# OR for GitLab (uncomment GitLab section in compose.yml)
# WOODPECKER_GITLAB_URL=https://gitlab.com
# WOODPECKER_GITLAB_CLIENT=<your-gitlab-client-id>
# WOODPECKER_GITLAB_SECRET=<your-gitlab-client-secret>
```

### 4. Update compose.yml (if not using GitHub)

If you're using Gitea or GitLab instead of GitHub, edit `compose.yml`:

1. Comment out the GitHub environment variables in the `woodpecker-server`
   service
2. Uncomment the Gitea or GitLab environment variables

### 5. Start the Services

```bash
cd /home/spy4x/dev/homelab/server
docker compose up -d woodpecker-server woodpecker-agent
```

### 6. Access Woodpecker CI

Visit `https://ci.yourdomain.com` and log in with your Git provider account.

## Usage

### Adding a Repository

1. Log in to Woodpecker CI
2. Click on "Repositories" in the menu
3. Find and enable your repository
4. Configure repository settings if needed

### Creating a Pipeline

Create a `.woodpecker.yml` file in your repository root:

```yaml
pipeline:
    build:
        image: node:18
        commands:
            - npm install
            - npm run build
            - npm test

    deploy:
        image: alpine
        commands:
            - echo "Deploying application..."
        when:
            branch: main
```

### Example Workflows

#### Node.js Application

```yaml
pipeline:
    install:
        image: node:18
        commands:
            - npm ci

    test:
        image: node:18
        commands:
            - npm run test
            - npm run lint

    build:
        image: node:18
        commands:
            - npm run build

    deploy:
        image: alpine
        secrets: [deploy_key]
        commands:
            - apk add --no-cache openssh-client
            - echo "Deploy to production"
        when:
            branch: main
            event: push
```

#### Docker Build

```yaml
pipeline:
    build:
        image: plugins/docker
        settings:
            repo: myregistry/myapp
            tags:
                - latest
                - ${CI_COMMIT_SHA:0:8}
            username:
                from_secret: docker_username
            password:
                from_secret: docker_password
        when:
            branch: main
```

## Managing Secrets

1. Go to your repository in Woodpecker
2. Click on "Settings" → "Secrets"
3. Add secrets (e.g., API keys, deploy keys)
4. Use them in pipelines with `from_secret` or `secrets` directive

## Troubleshooting

### Cannot connect to Git provider

- Verify OAuth credentials in `.env` file
- Check that callback URL matches exactly
- Ensure Woodpecker can reach your Git provider (network/firewall)

### Agent not connecting

- Verify `WOODPECKER_AGENT_SECRET` matches between server and agent
- Check agent logs: `docker logs woodpecker-agent`

### Pipelines not triggering

- Ensure webhook is configured in your repository
- Check Woodpecker server logs: `docker logs woodpecker-server`
- Verify repository is activated in Woodpecker UI

## Additional Resources

- [Official Documentation](https://woodpecker-ci.org/docs/intro)
- [Pipeline Syntax](https://woodpecker-ci.org/docs/usage/pipeline-syntax)
- [Plugins](https://woodpecker-ci.org/plugins)

## Backup

Important directories to backup:

- `./.volumes/woodpecker-server` - Contains database and configuration
