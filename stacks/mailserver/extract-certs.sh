#!/bin/bash
# Extract Let's Encrypt certificates from Traefik's acme.json and copy to mailserver
# This script should be run on the server (not locally)

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <mail.domain.com>"
    echo "Example: $0 mail.antonshubin.com"
    exit 1
fi

DOMAIN="$1"
VOLUMES_PATH="${VOLUMES_PATH:-$HOME/cloudlab/apps/.volumes}"
ACME_JSON="${VOLUMES_PATH}/traefik/letsencrypt/acme.json"
CERT_DIR="${VOLUMES_PATH}/mailserver/config/ssl"

# Create certificate directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Extract certificate and key from acme.json using jq
# Traefik stores certificates in base64 format in acme.json
if [ ! -f "$ACME_JSON" ]; then
    echo "Error: acme.json not found at $ACME_JSON"
    exit 1
fi

# Extract certificate for the domain
echo "Extracting certificate for $DOMAIN from Traefik acme.json..."

# Find the certificate in acme.json (might be in different resolvers)
CERT_DATA=$(jq -r --arg domain "$DOMAIN" '
  .myresolver.Certificates[] | 
  select(.domain.main == $domain or (.domain.sans[]? == $domain)) |
  .certificate
' "$ACME_JSON" | head -1)

KEY_DATA=$(jq -r --arg domain "$DOMAIN" '
  .myresolver.Certificates[] | 
  select(.domain.main == $domain or (.domain.sans[]? == $domain)) |
  .key
' "$ACME_JSON" | head -1)

if [ -z "$CERT_DATA" ] || [ "$CERT_DATA" == "null" ]; then
    echo "Error: Certificate for $DOMAIN not found in acme.json"
    echo "Available certificates:"
    jq -r '.myresolver.Certificates[].domain.main' "$ACME_JSON"
    exit 1
fi

# Decode and save certificate and key
echo "$CERT_DATA" | base64 -d > "$CERT_DIR/cert.pem"
echo "$KEY_DATA" | base64 -d > "$CERT_DIR/key.pem"

# Set proper permissions
chmod 644 "$CERT_DIR/cert.pem"
chmod 600 "$CERT_DIR/key.pem"

echo "Certificates extracted successfully:"
echo "  Certificate: $CERT_DIR/cert.pem"
echo "  Private key: $CERT_DIR/key.pem"

# Restart mailserver to apply new certificates
echo "Restarting mailserver..."
docker restart mailserver

echo "Done! Mailserver is now using Let's Encrypt certificates."
