# OpenHands Agent Canvas

AI-driven development platform. Manages GitHub issues, PRs, code review, and automated fixes through a Web UI.

## Access

Web UI: `https://code.${DOMAIN}`

Uses OpenHands's built-in auth (LOCAL_BACKEND_API_KEY).

## LLM Configuration

1. Open `https://code.${DOMAIN}`
2. Go to `Settings > LLM`
3. Provider: `OpenAI` (DeepSeek is OpenAI-compatible)
4. Base URL: `https://api.deepseek.com/v1`
5. Model: `deepseek-chat`
6. API Key: your `sk-...` DeepSeek key

Settings persist across restarts in the `/home/openhands/.openhands` volume.

### Recommended models

| Model               | Cost         | Quality                          |
| ------------------- | ------------ | -------------------------------- |
| `deepseek-chat`     | ~cents/day   | Good for simple tasks, bugfixes  |
| `claude-sonnet-4-*` | ~$3/M tokens | Best for complex multi-step work |

## GitHub Integration

### Web UI (simple)

Open repository in the UI: `Open Repository` → select repo → `Launch`. Work on issues/PRs interactively.

### Automated (label → PR)

Add `.github/workflows/openhands.yml` to each repo (needs GitHub token scoped to repos).

The Action runs OpenHands as a CI job triggered by label `fix-me` or `@openhands-agent` comments:
https://docs.openhands.dev/openhands/usage/run-openhands/github-action

## Docker Sandbox

By default, agents run in process mode (no container isolation). For isolated sandbox containers,
this stack connects to `hl-docker-sock-proxy:2375` via `DOCKER_HOST`.

IMPORTANT: The sandbox uses `ghcr.io/openhands/agent-server` images. First run will pull the image.

## Volumes

| Host path                         | Container path               | Purpose                     |
| --------------------------------- | ---------------------------- | --------------------------- |
| `${VOLUMES_PATH}/openhands`       | `/home/openhands/.openhands` | Config, secrets, history    |
| `${PATH_APPS}/openhands/projects` | `/projects`                  | Workspace for project files |

## Resources

- [OpenHands Docs](https://docs.openhands.dev/)
- [GitHub: OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)
- [Docker Socket Proxy](../docker-sock-proxy/README.md)
