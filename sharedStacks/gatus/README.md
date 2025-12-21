# Gatus

Health monitoring with HTTP/TCP checks and alerts.

## Features

- HTTP/HTTPS endpoint monitoring
- TCP port checks
- Custom conditions (status code, response time, body content)
- Push notifications via ntfy
- Historical uptime tracking

## Configuration

Edit `servers/{server}/configs/gatus.yml`:

```yaml
endpoints:
  - name: MyService
    url: "https://myservice.yourdomain.com"
    interval: 5m
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 1000"
    alerts:
      - type: ntfy
        failure-threshold: 2
        success-threshold: 2
        send-on-resolved: true
```

## Access

Dashboard: `https://uptime.${DOMAIN}`

## Cross-Server Monitoring

Each server monitors others to detect failures without single point of failure. Configure checks in each server's `gatus.yml`.

## Resources

- [Gatus Documentation](https://github.com/TwiN/gatus)
- [Condition Syntax](https://github.com/TwiN/gatus#conditions)
- [Alert Configuration](https://github.com/TwiN/gatus#alerting)
