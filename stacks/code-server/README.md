# code-server

VS Code running in your browser, accessible from any device including your phone.

## Features

- Full VS Code experience in the browser
- GitHub Copilot support (install extensions after first login)
- Direct access to your homelab repository
- Mobile-friendly interface
- Secure password-protected access

## Initial Setup

1. **Set passwords** in your server's `.env` file:
   ```bash
   CODE_SERVER_PASSWORD=your-secure-password-here
   CODE_SERVER_SUDO_PASSWORD=your-sudo-password-here
   ```

2. **Deploy the stack**:
   ```bash
   deno task deploy
   ```

3. **Access the IDE**:
   - Open `https://code.yourdomain.com`
   - Login with your `CODE_SERVER_PASSWORD`

4. **Install GitHub Copilot**:
   - Open Extensions (Ctrl+Shift+X or Cmd+Shift+X)
   - Search for "GitHub Copilot"
   - Install both "GitHub Copilot" and "GitHub Copilot Chat"
   - Sign in with your GitHub account

## Usage

### On Desktop
- Access via `https://code.yourdomain.com`
- Full keyboard shortcuts work
- Terminal access available

### On Mobile
- Works on iOS Safari and Android Chrome
- Touch-optimized interface
- External keyboard support recommended for extended coding sessions
- Use the hamburger menu (☰) to access all features

### Working with Homelab Repo

The homelab repository is automatically mounted at `/workspace/homelab`. You can:
- Edit compose files
- Update configurations
- Commit and push changes (Git is pre-installed)
- Deploy services directly from the terminal

### Terminal Access

Open the integrated terminal to run commands:
```bash
cd /workspace/homelab
git status
deno task deploy
```

## Tips for Mobile Coding

1. **Use a Bluetooth keyboard** for better typing experience
2. **Enable desktop site** in mobile browser for full features
3. **Pin the tab** to prevent accidental closes
4. **Use split view** on tablets for better multitasking
5. **Command Palette** (F1 or Ctrl+Shift+P) is your friend

## Security Notes

- Always use strong passwords in `.env`
- Access is protected by Traefik SSL
- Consider using Cloudflare Access for additional security layer
- The IDE has sudo access - be careful with terminal commands

## Troubleshooting

### Can't install extensions
- Make sure you're signed in with your GitHub account
- Check if the extension is compatible with code-server
- Some proprietary MS extensions may not work

### Performance issues on mobile
- Reduce memory/CPU limits in compose.yml if needed
- Close unused editor tabs
- Disable unused extensions
- Use simpler themes

### Changes not saving
- Check volume permissions
- Ensure enough disk space
- Check container logs: `docker logs code-server`

## Resources

- [code-server Documentation](https://coder.com/docs/code-server)
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/shortcuts/keyboard-shortcuts-linux.pdf)
- [GitHub Copilot](https://github.com/features/copilot)
