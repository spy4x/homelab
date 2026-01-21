#!/usr/bin/env deno run --allow-read --allow-write --allow-run

/**
 * Decrypt all .env*.age files to .env*
 * Uses single .age/key.txt and .sops.yml in root
 */

import { checkDependencies, decryptFile, findEncryptedFiles, getRelativePath } from "./+lib.ts"

async function main() {
  console.log("🔓 Decrypting environment files...")

  // Check dependencies
  const deps = await checkDependencies()
  if (!deps.sops || !deps.age) {
    console.error("❌ Missing required dependencies:")
    if (!deps.sops) {
      console.error("   - sops: Install with 'sudo apt install sops' or 'brew install sops'")
    }
    if (!deps.age) {
      console.error("   - age: Install with 'sudo apt install age' or 'brew install age'")
    }
    Deno.exit(1)
  }

  // Find all .env.age files
  const encryptedFiles = await findEncryptedFiles()

  if (encryptedFiles.length === 0) {
    console.log("ℹ️  No .env.age files found to decrypt")
    Deno.exit(0)
  }

  console.log(`Found ${encryptedFiles.length} file(s) to decrypt:\n`)

  let successCount = 0
  let failCount = 0

  // Decrypt each file
  for (const filePath of encryptedFiles) {
    const relativePath = getRelativePath(filePath)
    const decryptedRelativePath = relativePath.replace(/\.age$/, "")

    console.log(`   📄 ${relativePath}`)

    const result = await decryptFile(filePath)

    if (result.success) {
      console.log(`      ✅ Decrypted to ${decryptedRelativePath}`)
      successCount++
    } else {
      console.error(`      ❌ Failed: ${result.error}`)
      failCount++
    }
  }

  console.log(
    `\n${
      successCount > 0 ? "✅" : "❌"
    } Decrypted ${successCount}/${encryptedFiles.length} file(s)${
      failCount > 0 ? ` (${failCount} failed)` : ""
    }`,
  )

  if (failCount > 0) {
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
