#!/bin/sh
set -e

# Run ClickHouse + PG migrations before starting the app.
# eval starts a non-booted VM that must be halted explicitly.
/app/bin/plausible eval "Plausible.Release.migrate(); System.halt(0)"

# Now start the app
exec /app/bin/plausible start
