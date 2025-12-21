# Open WebUI

Self-hosted ChatGPT-like interface with Ollama integration.

## Features

- Chat with local LLMs via Ollama
- Multiple model support
- Conversation history
- Document upload for RAG
- Web search integration

## Access

Web UI: `https://ai.${DOMAIN}`

## Configuration

Requires Ollama running. Pull models:

```bash
docker exec -it open-webui ollama pull llama2
docker exec -it open-webui ollama pull codellama
```

## Resources

- [Open WebUI Documentation](https://docs.openwebui.com/)
- [Ollama Models](https://ollama.com/library)
