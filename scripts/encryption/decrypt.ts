#!/usr/bin/env deno run --allow-read --allow-write --allow-run --allow-env

import { join } from "@std/path"
import {
  decryptEnvFile,
  checkDependencies,
  type EncryptionContext,
} from "./+lib.ts"

// Simple argument parser
function parseArgs(args: string[]) {
  const result: Record<string, any> = { _: [] }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      result[key] = true
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1)
      result[key] = true
    } else {
      result._.push(arg)
    }
  }
  
  return result
}

const args = parseArgs(Deno.args)

if (args.h || args.help) {
  console.log(`
Environment File Decryption Tool

USAGE:
  deno task decrypt:env <server>

EXAMPLES:
  deno task decrypt:env home

DEPENDENCIES:
  - sops: https://github.com/getsops/sops
  - age: https://github.com/FiloSottile/age

Install dependencies:
  # macOS
  brew install sops age
  
  # Linux
  sudo apt install sops age  # Debian/Ubuntu
  sudo dnf install sops age  # Fedora/RHEL
`)
  Deno.exit(0)
}

const serverName = args._[0]
if (!serverName) {
  console.error("Error: Server name is required")
  console.error("Usage: deno task decrypt:env <server>")
  Deno.exit(1)
}

const envPath = join(Deno.cwd(), "servers", serverName)
const context: EncryptionContext = { serverName, envPath }

async function main() {
  // Check dependencies
  const deps = await checkDependencies()
  if (!deps.sops || !deps.age) {
    console.error("Error: Missing required dependencies:")
    if (!deps.sops) console.error("  - sops: Install with 'brew install sops' or 'sudo apt install sops'")
    if (!deps.age) console.error("  - age: Install with 'brew install age' or 'sudo apt install age'")
    Deno.exit(1)
  }

  console.log("Decrypting .env.age file for server:", serverName)
  
  const result = await decryptEnvFile(context)
  if (!result.success) {
    console.error("Decryption failed:", result.error)
    Deno.exit(1)
  }
  
  console.log("✓", result.output)
  console.log("\nYou can now use the decrypted .env file")
  console.log("Remember to add .env to .gitignore if not already done")
}

if (import.meta.main) {
  main().catch(console.error)
}