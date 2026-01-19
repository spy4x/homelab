#!/usr/bin/env deno run --allow-read --allow-write --allow-run --allow-env

/**
 * Encryption utilities for root .env.root file
 * This file handles encryption/decryption of the root environment file
 */

import { join } from "@std/path"
import { exists } from "@std/fs"
import { ensureDir } from "@std/fs"

const ROOT_DIR = Deno.cwd()
const ENV_FILE = ".env.root"
const ENCRYPTED_FILE = ".env.root.age"
const AGE_KEY_DIR = ".age"
const KEY_FILE = "key.txt"
const SOPS_CONFIG = ".sops.yaml"

interface CommandResult {
  success: boolean
  output: string
  error?: string
}

/**
 * Initialize encryption for root directory
 */
async function initEncryption(): Promise<CommandResult> {
  try {
    const ageKeyDir = join(ROOT_DIR, AGE_KEY_DIR)

    // Create .age directory
    if (!(await exists(ageKeyDir))) {
      await ensureDir(ageKeyDir)
    }

    const keyFile = join(ageKeyDir, KEY_FILE)

    // Generate age key if it doesn't exist
    if (await exists(keyFile)) {
      return {
        success: true,
        output: "Age key already exists",
      }
    }

    const keygenCommand = new Deno.Command("age-keygen", {
      args: ["-o", keyFile],
      cwd: ROOT_DIR,
    })

    const { code, stderr } = await keygenCommand.output()

    if (code !== 0) {
      return {
        success: false,
        output: "",
        error: new TextDecoder().decode(stderr),
      }
    }

    // Get public key
    const keyContent = await Deno.readTextFile(keyFile)
    const publicKeyLine = keyContent.split("\n").find((line) =>
      line.startsWith("# public key: ")
    )

    if (!publicKeyLine) {
      return {
        success: false,
        output: "",
        error: "Failed to extract public key",
      }
    }

    const publicKey = publicKeyLine.replace("# public key: ", "").trim()

    // Create .sops.yaml
    const sopsConfigPath = join(ROOT_DIR, SOPS_CONFIG)
    const sopsConfig = `creation_rules:
  - path_regex: \\.env\\.root$
    age: "${publicKey}"
`

    await Deno.writeTextFile(sopsConfigPath, sopsConfig)

    return {
      success: true,
      output: "Encryption initialized for root directory",
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Encrypt .env.root file
 */
async function encryptFile(): Promise<CommandResult> {
  try {
    const envFile = join(ROOT_DIR, ENV_FILE)
    const encryptedFile = join(ROOT_DIR, ENCRYPTED_FILE)

    if (!(await exists(envFile))) {
      return {
        success: false,
        output: "",
        error: `${ENV_FILE} not found`,
      }
    }

    const command = new Deno.Command("sops", {
      args: ["--encrypt", "--output", encryptedFile, envFile],
      cwd: ROOT_DIR,
    })

    const { code, stderr } = await command.output()

    if (code !== 0) {
      return {
        success: false,
        output: "",
        error: new TextDecoder().decode(stderr),
      }
    }

    return {
      success: true,
      output: `${ENV_FILE} encrypted to ${ENCRYPTED_FILE}`,
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Decrypt .env.root.age file
 */
async function decryptFile(): Promise<CommandResult> {
  try {
    const envFile = join(ROOT_DIR, ENV_FILE)
    const encryptedFile = join(ROOT_DIR, ENCRYPTED_FILE)

    if (!(await exists(encryptedFile))) {
      return {
        success: false,
        output: "",
        error: `${ENCRYPTED_FILE} not found`,
      }
    }

    const command = new Deno.Command("sops", {
      args: ["--decrypt", "--output", envFile, encryptedFile],
      cwd: ROOT_DIR,
    })

    const { code, stderr } = await command.output()

    if (code !== 0) {
      return {
        success: false,
        output: "",
        error: new TextDecoder().decode(stderr),
      }
    }

    return {
      success: true,
      output: `${ENCRYPTED_FILE} decrypted to ${ENV_FILE}`,
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check if required tools are installed
 */
async function checkDependencies(): Promise<{ sops: boolean; age: boolean }> {
  const checkCommand = async (cmd: string): Promise<boolean> => {
    try {
      const command = new Deno.Command(cmd, { args: ["--version"] })
      const { code } = await command.output()
      return code === 0
    } catch {
      return false
    }
  }

  return {
    sops: await checkCommand("sops"),
    age: await checkCommand("age-keygen"),
  }
}

// Main execution
if (import.meta.main) {
  const command = Deno.args[0]

  if (!command || command === "--help" || command === "-h") {
    console.log(`
Root Environment File Encryption Tool

USAGE:
  deno task encrypt:root:init    Initialize encryption for root
  deno task encrypt:root         Encrypt .env.root file
  deno task decrypt:root         Decrypt .env.root.age file

EXAMPLES:
  deno task encrypt:root:init
  deno task encrypt:root
  deno task decrypt:root

DEPENDENCIES:
  - sops: https://github.com/getsops/sops
  - age: https://github.com/FiloSottile/age
`)
    Deno.exit(0)
  }

  // Check dependencies
  const deps = await checkDependencies()
  if (!deps.sops || !deps.age) {
    console.error("Error: Missing required dependencies:")
    if (!deps.sops) {
      console.error(
        "  - sops: Install with 'brew install sops' or 'sudo apt install sops'",
      )
    }
    if (!deps.age) {
      console.error(
        "  - age: Install with 'brew install age' or 'sudo apt install age'",
      )
    }
    Deno.exit(1)
  }

  let result: CommandResult

  switch (command) {
    case "init":
      console.log("Initializing encryption for root directory...")
      result = await initEncryption()
      if (result.success) {
        console.log("✓", result.output)
        console.log(`\nKey file: ${join(ROOT_DIR, AGE_KEY_DIR, KEY_FILE)}`)
        console.log(`SOPS config: ${join(ROOT_DIR, SOPS_CONFIG)}`)
      } else {
        console.error("Failed:", result.error)
        Deno.exit(1)
      }
      break

    case "encrypt":
      console.log("Encrypting .env.root file...")
      result = await encryptFile()
      if (result.success) {
        console.log("✓", result.output)
        console.log("\nYou can now commit .env.root.age to git")
        console.log("Remove plaintext .env.root from git tracking:")
        console.log("  git rm --cached .env.root")
      } else {
        console.error("Failed:", result.error)
        Deno.exit(1)
      }
      break

    case "decrypt":
      console.log("Decrypting .env.root.age file...")
      result = await decryptFile()
      if (result.success) {
        console.log("✓", result.output)
      } else {
        console.error("Failed:", result.error)
        Deno.exit(1)
      }
      break

    default:
      console.error("Unknown command:", command)
      console.error("Available: init, encrypt, decrypt")
      Deno.exit(1)
  }
}
