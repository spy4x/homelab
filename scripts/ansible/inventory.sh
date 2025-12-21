#!/bin/bash
# Wrapper script for dynamic Ansible inventory
# This allows Ansible to call the TypeScript inventory script
exec deno run -A "$(dirname "$0")/inventory.ts" "$@"
