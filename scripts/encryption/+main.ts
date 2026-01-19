#!/usr/bin/env deno run --allow-read --allow-write --allow-run --allow-env

import { join } from "@std/path"
// Simple argument parser instead of @std/cli
function parseArgs(args: string[], options: { string?: string[], boolean?: string[], alias?: Record<string, string> }) {
  const result: Record<string, any> = { _: [] }
  const aliasMap = options.alias || {}
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const realKey = aliasMap[key] || key
      
      if (options.string?.includes(realKey)) {
        result[realKey] = args[++i]
      } else if (options.boolean?.includes(realKey)) {
        result[realKey] = true
      } else {
        result._.push(key)
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1)
      const realKey = aliasMap[key] || key
      
      if (options.boolean?.includes(realKey)) {
        result[realKey] = true
      } else if (options.string?.includes(realKey)) {
        result[realKey] = args[++i]
      } else {
        result._.push(key)
      }
    } else {
      result._.push(arg)
    }
  }
  
  return result
}
import { 
  initializeAgeKey,
  createSopsConfig,
  encryptEnvFile,
  decryptEnvFile,
  checkDependencies,
  type EncryptionContext
} from "./+lib.ts"

const args = parseArgs(Deno.args, {
  string: ["server"],
  boolean: ["help"],
  alias: { h: "help" }
})

if (args.help) {
  console.log(`
Environment File Encryption Tool

USAGE:
  deno task encrypt:init <server>     Initialize encryption for server
  deno task encrypt:env <server>     Encrypt .env file
  deno task decrypt:env <server>     Decrypt .env file

EXAMPLES:
  deno task encrypt:init home
  deno task encrypt:env home
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

const serverName = args.server
if (!serverName) {
  console.error("Error: Server name is required")
  console.error("Usage: deno task encrypt:init <server>")
  Deno.exit(1)
}

const envPath = join(Deno.cwd(), "servers", serverName)
const context: EncryptionContext = { serverName, envPath }

async function main() {
  const command = Deno.args[0]?.split(":")?.[1] || "init"
  
  // Check dependencies
  const deps = await checkDependencies()
  if (!deps.sops || !deps.age) {
    console.error("Error: Missing required dependencies:")
    if (!deps.sops) console.error("  - sops: Install with 'brew install sops' or 'sudo apt install sops'")
    if (!deps.age) console.error("  - age: Install with 'brew install age' or 'sudo apt install age'")
    Deno.exit(1)
  }

  switch (command) {
    case "init": {
      console.log("Initializing encryption for server:", serverName)
      
      const keyResult = await initializeAgeKey(context)
      if (!keyResult.success) {
        console.error("Failed to initialize age key:", keyResult.error)
        Deno.exit(1)
      }
      console.log("✓", keyResult.output)
      
      const configResult = await createSopsConfig(context)
      if (!configResult.success) {
        console.error("Failed to create SOPS config:", configResult.error)
        Deno.exit(1)
      }
      console.log("✓", configResult.output)
      
      console.log(`\nEncryption initialized for ${serverName}`)
      console.log(`Key file stored in: ${join(envPath, ".age/key.txt")}`)
      console.log(`SOPS config created: ${join(envPath, ".sops.yaml")}`)
      break
    }
      
    case "env": {
      console.log("Encrypting .env file for server:", serverName)
      
      const result = await encryptEnvFile(context)
      if (!result.success) {
        console.error("Encryption failed:", result.error)
        Deno.exit(1)
      }
      
      console.log("✓", result.output)
      console.log("\nYou can now commit the .env.age file to git")
      console.log("Remove the plaintext .env file from git tracking:")
      console.log(`  git rm --cached servers/${serverName}/.env`)
      break
    }
      
    default:
      console.error("Unknown command:", command)
      console.error("Available: init, env")
      Deno.exit(1)
  }
}

if (import.meta.main) {
  main().catch(console.error)
}