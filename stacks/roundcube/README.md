# Roundcube

Modern webmail interface for accessing email.

## Features

- Full-featured email client
- Address book
- HTML email support
- Attachments
- Search and filters
- Mobile-responsive

## Access

Webmail: `https://webmail.${DOMAIN}`

## Configuration

Connects to local mailserver automatically. No additional setup required after mailserver configuration.

## Troubleshooting

### CSS/JS not loading (naked HTML)

If the webmail shows only plain HTML without styling:

1. **Clear the www volume** - The www volume can get corrupted. SSH to the server and run:
   ```bash
   cd ~/apps
   podman compose -f roundcube/compose.yml down
   rm -rf volumes/roundcube/www
   podman compose -f roundcube/compose.yml up -d
   ```
   Wait 1-2 minutes for static assets to initialize.

2. **Check container logs**:
   ```bash
   podman logs roundcube
   ```

3. **Verify resources** - If container is OOM killed, check memory usage:
   ```bash
   podman stats roundcube --no-stream
   ```

### Connection timeout / slow loading

1. **Check mailserver connectivity**:
   ```bash
   podman exec roundcube nc -zv mailserver 993
   podman exec roundcube nc -zv mailserver 587
   ```

2. **Restart the container**:
   ```bash
   podman restart roundcube
   ```

### IMAP connection failed (SSL certificate error)

If you see "Connection to IMAP server failed" and mailserver logs show SSL errors:

1. **Create a custom config** to disable SSL verification for internal connections:
   ```bash
   sudo tee /path/to/.volumes/roundcube/config/custom.inc.php << 'EOF'
   <?php
   $config["imap_conn_options"] = [
       "ssl" => [
           "verify_peer" => false,
           "verify_peer_name" => false,
           "allow_self_signed" => true,
       ],
   ];
   $config["smtp_conn_options"] = [
       "ssl" => [
           "verify_peer" => false,
           "verify_peer_name" => false,
           "allow_self_signed" => true,
       ],
   ];
   EOF
   ```

2. **Restart Roundcube** to pick up the new config:
   ```bash
   docker restart roundcube
   ```

## Resources

- [Roundcube Website](https://roundcube.net/)
- [User Documentation](https://github.com/roundcube/roundcubemail/wiki)
- [Docker Image](https://github.com/roundcube/roundcubemail-docker)
