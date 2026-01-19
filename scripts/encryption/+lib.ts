import { join } from "@std/path"
import { exists } from "@std/fs"
import { ensureDir } from "@std/fs"

export interface EncryptionContext {
  serverName: string
  envPath: string
  keyPath?: string
}

export interface EncryptionResult {
  success: boolean
  output: string
  error?: string
}

const AGE_KEY_DIR = ".age"
const SOPS_CONFIG_FILE = ".sops.yaml"

/**
 * Initialize age key pair for encryption
 */
export async function initializeAgeKey(context: EncryptionContext): Promise<EncryptionResult> {
  try {
    const ageKeyDir = join(context.envPath, AGE_KEY_DIR)

    if (!(await exists(ageKeyDir))) {
      await ensureDir(ageKeyDir)
    }

    const keyFile = join(ageKeyDir, "key.txt")

    if (await exists(keyFile)) {
      return {
        success: true,
        output: "Age key already exists",
      }
    }

    const command = new Deno.Command("age-keygen", {
      args: ["-o", keyFile],
      cwd: context.envPath,
    })

    const { code, stdout, stderr } = await command.output()

    if (code !== 0) {
      return {
        success: false,
        output: "",
        error: new TextDecoder().decode(stderr),
      }
    }

    return {
      success: true,
      output: "Age key generated successfully",
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
 * Get public key from age key file
 */
export async function getPublicKey(context: EncryptionContext): Promise<string> {
  const keyFile = join(context.envPath, AGE_KEY_DIR, "key.txt")

  if (!(await exists(keyFile))) {
    throw new Error("Age key file not found. Run initializeAgeKey first.")
  }

  const content = await Deno.readTextFile(keyFile)
  const lines = content.split("\n")
  const publicKeyLine = lines.find((line: string) => line.startsWith("# public key: "))

  if (!publicKeyLine) {
    throw new Error("Public key not found in key file")
  }

  return publicKeyLine.replace("# public key: ", "").trim()
}

/**
 * Create SOPS configuration file
 */
export async function createSopsConfig(context: EncryptionContext): Promise<EncryptionResult> {
  try {
    const publicKey = await getPublicKey(context)
    const sopsConfigPath = join(context.envPath, SOPS_CONFIG_FILE)

    const config = `creation_rules:
  - path_regex: \\.env$
    age: "${publicKey}"
  - path_regex: \\.env\\..*$
    age: "${publicKey}"
`

    await Deno.writeTextFile(sopsConfigPath, config)

    return {
      success: true,
      output: "SOPS configuration created",
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
 * Encrypt .env file using SOPS and age
 */
export async function encryptEnvFile(context: EncryptionContext): Promise<EncryptionResult> {
  try {
    const envFile = join(context.envPath, ".env")
    const encryptedFile = join(context.envPath, ".env.age")

    if (!(await exists(envFile))) {
      return {
        success: false,
        output: "",
        error: ".env file not found",
      }
    }

    const command = new Deno.Command("sops", {
      args: ["--encrypt", "--output", encryptedFile, envFile],
      cwd: context.envPath,
    })

    const { code, stdout, stderr } = await command.output()

    if (code !== 0) {
      return {
        success: false,
        output: "",
        error: new TextDecoder().decode(stderr),
      }
    }

    return {
      success: true,
      output: `Environment file encrypted to ${encryptedFile}`,
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
 * Decrypt .env.age file using SOPS and age
 */
export async function decryptEnvFile(context: EncryptionContext): Promise<EncryptionResult> {
  try {
    const encryptedFile = join(context.envPath, ".env.age")
    const envFile = join(context.envPath, ".env")

    if (!(await exists(encryptedFile))) {
      return {
        success: false,
        output: "",
        error: ".env.age file not found",
      }
    }

    const command = new Deno.Command("sops", {
      args: ["--decrypt", "--output", envFile, encryptedFile],
      cwd: context.envPath,
    })

    const { code, stdout, stderr } = await command.output()

    if (code !== 0) {
      return {
        success: false,
        output: "",
        error: new TextDecoder().decode(stderr),
      }
    }

    return {
      success: true,
      output: `Environment file decrypted to ${envFile}`,
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
 * Check if tools are available
 */
export async function checkDependencies(): Promise<{ sops: boolean; age: boolean }> {
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
    age: await checkCommand("age-keygen")
  }
}