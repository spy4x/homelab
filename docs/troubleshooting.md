# Troubleshooting

Common issues and debug workflows.

## Deployment

**Import resolution errors**  
Dynamic imports don't respect Deno import maps. Use relative paths in `.backup.ts` files.

**Missing environment variables**  
Check `.env.example` for required variables. Add to server's `.env`.

**Port conflicts**  
```bash
sudo lsof -i :8080              # Find conflicting process
docker compose stop <service>   # Stop conflict
```

## Backups

**Permission denied**  
```bash
sudo chown -R $USER:$USER .volumes/myservice
```

**Repository not found**  
```bash
export RESTIC_PASSWORD='your-password'
restic init -r ~/sync/backups/myservice
```

**Container won't stop**  
Increase timeout in backup config or manually stop container before backup.

## Traefik

**SSL not issued**  
```bash
docker compose logs traefik | grep -i error  # Check errors
dig myservice.yourdomain.com                 # Verify DNS
```
Let's Encrypt rate limit: 5 failures/hour.

**Service not accessible**  
```bash
docker inspect myservice | grep Networks -A 5      # Check network
docker compose logs traefik | grep myservice       # Check discovery
docker inspect myservice | grep -A 20 Labels       # Verify labels
```

See [Traefik docs](https://doc.traefik.io/traefik/) for label syntax.

## Docker Compose

**Compose file not found**  
Verify deployment: `deno task deploy <server>`

**Stack not deploying**  
Check `servers/<server>/config.json` includes stack in `stacks` array.

## Monitoring

**Gatus shows service down**  
```bash
curl -I https://myservice.yourdomain.com   # Test endpoint
docker compose logs gatus                  # Check logs
```

**Ntfy not sending**  
```bash
curl -H "Authorization: Bearer $NTFY_AUTH_TOKEN" \
  -d "Test" https://ntfy.yourdomain.com/homelab-alerts
```

## Resources

**Disk full**  
```bash
docker system prune -a                                # Clean Docker
sudo journalctl --vacuum-time=7d                      # Clean logs
restic -r ~/sync/backups/myservice forget --keep-daily 7 --prune  # Prune backups
```

**High CPU/memory**  
```bash
docker stats                    # Identify resource hog
# Add limits to compose.yml:
deploy:
  resources:
    limits:
      cpus: "2"
      memory: 2048M
```

## Debug Commands

```bash
docker compose logs -f <service>           # Follow logs
docker inspect <service> | jq              # Full config
docker compose config                      # Validate compose
restic -r ~/sync/backups/myservice check   # Verify backup repo
```

## Recovery

**Restore from backup**  
```bash
deno task restore  # Interactive restoration
```

**Rebuild container**  
```bash
docker compose stop myservice
docker compose rm myservice
docker compose pull myservice
docker compose up -d myservice
```

See [Restic docs](https://restic.readthedocs.io/) for manual restoration.
