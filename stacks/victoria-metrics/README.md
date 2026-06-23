# VictoriaMetrics Stack (comparison)

Side-by-side deployment with the existing Prometheus + Loki + Grafana stack
(`stacks/monitoring` + `stacks/grafana`). Same scrape targets, same data,
different runtime. Goal: **measure resource consumption delta**.

## Why VM?

VictoriaMetrics is a single-binary, Prometheus-compatible metrics TSDB.
VictoriaLogs is the same idea for logs. Both claim to be more efficient than
the Prometheus + Loki stack they replace. This stack exists to verify that
on the home server's actual workload.

## Components

| Service            | Replaces             | Memory limit | CPU limit |
| ------------------ | -------------------- | ------------ | --------- |
| `victoria-metrics` | Prometheus           | 256M         | 0.3       |
| `vmagent`          | (Prometheus scraper) | 128M         | 0.2       |
| `victoria-logs`    | Loki                 | 256M         | 0.3       |
| `promtail-vm`      | Promtail             | 128M         | 0.2       |
| `grafana-vm`       | (Grafana, separate)  | 256M         | 0.3       |
| **Total**          |                      | **1.02G**    | **1.3**   |

For comparison, the existing stack:

| Service    | Memory    | CPU     |
| ---------- | --------- | ------- |
| prometheus | 512M      | 0.5     |
| loki       | 256M      | 0.3     |
| promtail   | 128M      | 0.1     |
| cadvisor   | 128M      | 0.3     |
| grafana    | 512M      | 0.5     |
| **Total**  | **1.54G** | **1.7** |

## URLs

- **VictoriaMetrics UI**: `https://metrics-vm.${DOMAIN}` (Grafana VM)
- **Existing stack UI**: `https://metrics.${DOMAIN}` (Grafana, kept for comparison)
- **VM API**: `http://hl-victoria-metrics:8428` (internal)
- **VL API**: `http://hl-victoria-logs:9428` (internal)

## Setup

1. Add env var to `servers/home/.env`:

   ```bash
   #region VictoriaMetrics
   GRAFANA_VM_ADMIN_PASSWORD=YOUR_SECURE_PASSWORD
   #endregion VictoriaMetrics
   ```

2. Deploy:

   ```bash
   deno task deploy home victoria-metrics
   ```

3. Open `https://metrics-vm.${DOMAIN}` and check the VM + VL datasources work.

## Comparison methodology

After running both stacks for a week, compare:

```bash
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' \
  | grep -E 'hl-prometheus|hl-loki|hl-promtail|hl-grafana|hl-victoria'
```

- **Memory**: `docker stats` RSS over 24h
- **Disk**: `du -sh /volumes/monitoring/*` vs `du -sh /volumes/victoria-metrics/*`
- **Query latency**: same PromQL query against both backends
- **Ingestion lag**: how quickly new metrics appear after scrape

## Tradeoffs

| Aspect                  | Prometheus + Loki             | VictoriaMetrics + VictoriaLogs              |
| ----------------------- | ----------------------------- | ------------------------------------------- |
| **Maturity**            | Battle-tested, huge community | Newer (since 2018), smaller community       |
| **Ecosystem**           | First-class in Grafana        | First-class in Grafana (PromQL/Loki compat) |
| **HA story**            | Federated / Thanos            | vmagent replication + vmstorage cluster     |
| **Logs query language** | LogQL                         | LogsQL (different syntax)                   |
| **Memory footprint**    | Higher                        | Lower (claim)                               |
| **Disk footprint**      | Higher                        | Lower (claim — better compression)          |
| **Single binary**       | No (Java + Go)                | Yes (Go)                                    |

## Decision

Run both for at least 2 weeks. If VM stack uses <70% of the resources of the
Prometheus+Loki stack AND the dashboards work, plan migration. Otherwise
keep the existing stack and remove this one.

## References

- [VictoriaMetrics](https://docs.victoriametrics.com/)
- [VictoriaLogs](https://docs.victoriametrics.com/victorialogs/)
- [VMAgent](https://docs.victoriametrics.com/vmagent.html)
