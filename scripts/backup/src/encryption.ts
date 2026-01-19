import { join } from "@std/path"
import { exists } from "@std/fs"
import { runCommand } from "../../+lib.ts"

/**
 * Decrypt environment file before running backups
 */
export async function ensureDecryptedEnv(serverPath: string): Promise<boolean> {
  const envFile = join(serverPath, ".env")
  const encryptedFile = join(serverPath, ".env.age")

  // If .env exists, we're good
  if (await exists(envFile)) {
    return true
  }

  // If .env.age exists, try to decrypt it
  if (await exists(encryptedFile)) {
    try {
      const result = await runCommand([
        "sops",
        "--decrypt",
        "--output",
        envFile,
        encryptedFile,
      ], { cwd: serverPath })

      if (result.success) {
        console.log(`✓ Decrypted .env.age to .env for ${serverPath}`)
        return true
      } else {
        console.error(`Failed to decrypt .env.age for ${serverPath}: ${result.error}`)
        return false
      }
    } catch (error) {
      console.error(`Failed to decrypt .env.age for ${serverPath}:`, error)
      return false
    }
  }

  // Neither file exists
  return false
}

/**
 * Check if server has encrypted environment
 */
export async function hasEncryptedEnv(serverPath: string): Promise<boolean> {
  return await exists(join(serverPath, ".env.age"))
}

/**
 * Clean up decrypted .env file after backup (optional)
 */
export async function cleanupDecryptedEnv(serverPath: string): Promise<void> {
  const envFile = join(serverPath, ".env")
  const encryptedFile = join(serverPath, ".env.age")

  // Only clean up if encrypted version exists
  if (await exists(encryptedFile) && await exists(envFile)) {
    try {
      await Deno.remove(envFile)
      console.log(`🗑️  Cleaned up decrypted .env file for ${serverPath}`)
    } catch (error) {
      console.error(`Failed to clean up .env for ${serverPath}:`, error)
    }
  }
}