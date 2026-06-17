#!/bin/sh
set -e

# Run ClickHouse + PG migrations before starting
/app/bin/plausible eval "Plausible.Release.migrate"

# Now start the app
exec /app/bin/plausible start
