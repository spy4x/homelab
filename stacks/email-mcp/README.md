# Email MCP

Email server MCP for AI assistants (Open WebUI, Claude Desktop, etc.).
Speaks IMAP + SMTP via the [Model Context Protocol](https://modelcontextprotocol.io/).

- **Upstream**: [ai-zerolab/mcp-email-server](https://github.com/ai-zerolab/mcp-email-server) (BSD-3-Clause)
- **Image**: `ghcr.io/ai-zerolab/mcp-email-server:latest`
- **Transport**: Streamable HTTP on port 9557
- **Backend**: `mailserver` stack on the **cloud** server (mail.${DOMAIN})

## Why this MCP?

The user has a self-hosted Docker Mailserver on the cloud server. This MCP
exposes it to AI agents without going through Gmail/OAuth. Same pattern as
`caldav-mcp` (events/todos) and `immich-mcp` (photos): a thin HTTP MCP that
wraps a self-hosted protocol server.

## Tools exposed

| Tool                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `list_accounts`       | List configured accounts                                 |
| `list_mailboxes`      | List IMAP folders (INBOX, Sent, Drafts, Trash, …)        |
| `get_mailbox_status`  | Unread count + total per folder                          |
| `search_emails`       | Search by sender, subject, body, date range              |
| `get_emails_content`  | Read full email (body + headers + attachment list)       |
| `send_email`          | Send new email with CC/BCC, plain or HTML                |
| `reply_email`         | Reply with proper `In-Reply-To` / `References` threading |
| `forward_email`       | Forward original content                                 |
| `move_email`          | Move between folders                                     |
| `delete_email`        | Trash or hard-delete                                     |
| `mark_email`          | Read/unread, flag/unflag                                 |
| `save_draft`          | Save draft to Drafts folder                              |
| `download_attachment` | Download attachment (disabled by default — see below)    |

## Setup

### 1. Ensure the IMAP/SMTP account exists

```bash
ssh cloud 'docker exec -it mailserver setup email list'
```

If `anton@antonshubin.com` is missing, create it:

```bash
ssh cloud 'docker exec -it mailserver setup email add anton@antonshubin.com'
# Enter the same password as EMAIL_MCP_PRIMARY_PASSWORD in servers/home/.env
```

### 2. Add env vars to `servers/home/.env`

```bash
#region Email MCP
EMAIL_MCP_PRIMARY_USER=anton@antonshubin.com
EMAIL_MCP_PRIMARY_PASSWORD=YOUR_PASSWORD_HERE
#endregion Email MCP
```

`SMTP_HOST` is shared with other services (set in the SMTP region).

### 3. Deploy

```bash
deno task deploy home email-mcp
```

### 4. Wire into Open WebUI

Add to `TOOL_SERVER_CONNECTIONS` in `stacks/open-webui/compose.yml`:

```json
{
  "url": "http://hl-email-mcp:9557/mcp",
  "type": "mcp",
  "auth_type": "none",
  "headers": {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json"
  },
  "info": {
    "id": "email-mcp",
    "name": "Email MCP",
    "description": "IMAP + SMTP via mail.antonshubin.com"
  },
  "config": {
    "enable": true,
    "access_grants": [{ "principal_type": "user", "principal_id": "*", "permission": "read" }]
  }
}
```

Then restart Open WebUI:

```bash
deno task deploy home open-webui
```

### 5. Verify

In Open WebUI chat:

> "List my mailboxes"
> "Show me unread emails in INBOX"
> "Send an email to test@example.com with subject 'hello' and body 'world'"

## DNS / TLS

`SMTP_HOST=mail.${DOMAIN}` resolves via Cloudflare to the cloud server's
public IP. STARTTLS on port 587 uses a Let's Encrypt certificate
(CN=mail.${DOMAIN}). VERIFY_SSL stays `true`.

If you ever point this at a self-signed bridge (e.g. ProtonMail Bridge),
set `MCP_EMAIL_SERVER_SMTP_VERIFY_SSL=false` and `MCP_EMAIL_SERVER_IMAP_VERIFY_SSL=false`.

## Attachment downloads (optional)

Disabled by default for safety. To enable, set
`MCP_EMAIL_SERVER_ENABLE_ATTACHMENT_DOWNLOAD=true` in `compose.yml`.
The LLM can then call `download_attachment` to save files to a path inside
the container. Mount a volume if you need files on the host.

## Multi-account

To add a second account, append `MCP_EMAIL_SERVER_*` env vars with a
different `MCP_EMAIL_SERVER_ACCOUNT_NAME`. The MCP supports multiple
accounts natively.

## Security notes

- DNS rebinding protection is enabled. Allowed hosts/origins are restricted
  to the email-mcp container, Open WebUI, and localhost.
- No Traefik labels — the MCP is only reachable from the proxy Docker network.
- Container has `no-new-privileges:true` and a 256M memory limit.
- The MCP holds your plaintext password in env. Rotate via
  `setup email update` on the mailserver if leaked.

## Troubleshooting

| Symptom                              | Cause                                  | Fix                                                               |
| ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------- |
| `535 Authentication failed`          | Wrong password or missing account      | `setup email update anton@antonshubin.com`                        |
| `Connection refused` on port 993/587 | Firewall blocks home → cloud           | Check cloud security group                                        |
| `CERTIFICATE_VERIFY_FAILED`          | Wrong cert or clock skew               | Verify `mail.${DOMAIN}` resolves to cloud, check `date`           |
| Tools not showing in Open WebUI      | TOOL_SERVER_CONNECTIONS misconfigured  | Check JSON syntax; restart Open WebUI container                   |
| 403 from MCP                         | DNS rebinding protection blocks origin | Add host to `MCP_ALLOWED_HOSTS` / origin to `MCP_ALLOWED_ORIGINS` |
