# Encrypted Environment Files

This document describes how to manage encrypted `.env` files using SOPS and age, following industry best practices for secret management in Git repositories.

## Overview

The homelab uses **SOPS** (Secrets OPerationS) with **age** encryption to securely store environment files in Git. This approach:

- ✅ Keeps secrets out of Git history
- ✅ Allows multiple team members with their own keys
- ✅ Integrates seamlessly with existing workflows
- ✅ Uses modern, audited encryption libraries
- ✅ Supports automated decryption during deployment

## Prerequisites

Install the required tools:

```bash
# macOS
brew install sops age

# Debian/Ubuntu
sudo apt install sops age

# Fedora/RHEL
sudo dnf install sops age

# Verify installation
sops --version
age-keygen --version
```

## Quick Start

### 1. Initialize Encryption for a Server

```bash
# Initialize encryption for the 'home' server
deno task encrypt:init home
```

This creates:
- `servers/home/.age/key.txt` - Age key pair (keep this secret!)
- `servers/home/.sops.yaml` - SOPS configuration

### 2. Encrypt Your Environment File

```bash
# Encrypt .env to .env.age
deno task encrypt:env home
```

This creates `servers/home/.env.age` and you can now:

```bash
# Remove plaintext from Git tracking
git rm --cached servers/home/.env

# Commit the encrypted version
git add servers/home/.env.age
git commit -m "feat: add encrypted environment for home"
```

### 3. Use Encrypted Files

The backup system automatically decrypts `.env.age` files when needed:

```bash
# Run backup (automatically decrypts if needed)
deno task backup

# Manual decryption
deno task decrypt:env home
```

## File Structure

```
servers/
└── home/
    ├── .env.age          # ✅ Encrypted (safe in Git)
    ├── .env.example      # ✅ Template (safe in Git)
    ├── .age/
    │   └── key.txt       # ❌ Secret keys (gitignored)
    └── .sops.yaml        # ✅ SOPS config (safe in Git)
```

## Commands Reference

### `deno task encrypt:init <server>`
Initialize encryption for a server:
- Generates age key pair
- Creates SOPS configuration
- Sets up `.age/` directory

### `deno task encrypt:env <server>`
Encrypt environment file:
- Reads `.env` (plaintext)
- Creates `.env.age` (encrypted)
- Leaves `.env` unchanged (you handle git tracking)

### `deno task decrypt:env <server>`
Decrypt environment file:
- Reads `.env.age` (encrypted)
- Creates `.env` (plaintext)
- Ready for use in scripts

## Key Management

### Personal Key
Each developer generates their own age key:

```bash
# The key file contains both private and public keys
cat servers/home/.age/key.txt
```

### Sharing Access
To allow multiple people to decrypt:

1. **Add their public key** to `.sops.yaml`:

```yaml
creation_rules:
  - path_regex: \.env$
    age: "age1yourkey,age1theirkey"
```

2. **Re-encrypt** with updated keys:

```bash
cd servers/home
sops --encrypt --in-place .env.age
```

### Security Best Practices

1. **Never commit** `.age/key.txt` files
2. **Back up** age keys securely (password manager, encrypted storage)
3. **Rotate keys** periodically if team members leave
4. **Use separate keys** for production vs development

## Integration with Workflows

### Backup System
The backup system automatically handles encrypted files:

```bash
# Automatically decrypts .env.age before backup
deno task backup

# Cleans up decrypted files after completion
```

### Deployment
Scripts can require decryption:

```bash
# Ensure .env exists before deployment
if [ ! -f ".env" ]; then
  deno task decrypt:env home
fi

# Deploy with decrypted environment
docker compose up -d
```

### CI/CD
In CI/CD, decrypt using secrets:

```yaml
# GitHub Actions example
- name: Decrypt environment
  run: |
    echo "${AGE_PRIVATE_KEY}" > .age/key.txt
    deno task decrypt:env home
  env:
    AGE_PRIVATE_KEY: ${{ secrets.AGE_PRIVATE_KEY }}
```

## Migration Guide

### Existing Plain .env Files

1. **Initialize encryption**:
   ```bash
   deno task encrypt:init home
   ```

2. **Encrypt current file**:
   ```bash
   deno task encrypt:env home
   ```

3. **Update Git tracking**:
   ```bash
   git rm --cached servers/home/.env
   git add servers/home/.env.age
   git commit -m "migrate: encrypt environment files"
   ```

4. **Add to .gitignore** (if not already):
   ```
   .env
   !.env.example
   .age/
   ```

## Troubleshooting

### "No age key found"
```bash
# Ensure .age/key.txt exists and has correct permissions
ls -la servers/home/.age/key.txt
chmod 600 servers/home/.age/key.txt
```

### "SOPS can't find key"
```bash
# Check SOPS configuration
cat servers/home/.sops.yaml

# Verify public key matches
age-keygen -y .age/key.txt
```

### "Failed to decrypt"
```bash
# Check file permissions and existence
ls -la servers/home/.env.age servers/home/.env

# Manual decryption
cd servers/home
sops --decrypt .env.age
```

## Security Considerations

- **Age uses X25519** for asymmetric encryption (industry standard)
- **SOPS adds metadata** and supports key rotation
- **Git history** contains only encrypted blobs
- **No passwords** in plaintext anywhere
- **Audit trail** of who encrypted what when

## Advanced Usage

### Multiple Environment Files
```bash
# Encrypt different environments
deno task encrypt:env home  # .env.age
deno task encrypt:env staging  # .env.age
```

### Selective Encryption
Edit `.sops.yaml` to encrypt only specific patterns:

```yaml
creation_rules:
  - path_regex: \.prod\.env$
    age: "age1productionkey"
  - path_regex: \.dev\.env$
    age: "age1developmentkey"
```

### Key Rotation
1. Generate new age key
2. Add to `.sops.yaml`
3. Re-encrypt all files
4. Remove old key after verification

## Resources

- [SOPS Documentation](https://github.com/getsops/sops)
- [Age Documentation](https://github.com/FiloSottile/age)
- [Best Practices](https://github.com/getsops/sops#best-practices)