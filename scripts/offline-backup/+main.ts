#!/usr/bin/env -S deno run -A

import { loadEnvFile, runCommand } from "../+lib.ts"

const MOUNT_POINT = "/tmp/offline-backups-mount"
const METADATA_DIR = "metadata"
const REPOS_DIR = "restic-repos"
const DOCS_DIR = "documentation"

interface DriveInfo {
  name: string
  size: string
  model: string
  type: string
}

async function listDrives(): Promise<DriveInfo[]> {
  const cmd = new Deno.Command("lsblk", {
    args: ["-ndo", "NAME,SIZE,MODEL,TYPE"],
    stdout: "piped",
  })
  const output = await cmd.output()
  const text = new TextDecoder().decode(output.stdout)

  return text
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) return null
      return {
        name: parts[0],
        size: parts[1],
        model: parts.slice(2, -1).join(" "),
        type: parts[parts.length - 1],
      }
    })
    .filter((d): d is DriveInfo => d !== null && d.type === "disk")
}

async function checkDriveExists(driveName: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(`/dev/${driveName}`);
    return stat.isBlockDevice ?? false;
  } catch {
    return false;
  }
}

async function isMounted(device: string): Promise<boolean> {
  const result = await runCommand(["mount"])
  return result.output.includes(device)
}

async function mountDrive(device: string, mountPoint: string): Promise<void> {
  console.log(`📂 Creating mount point: ${mountPoint}`)
  await Deno.mkdir(mountPoint, { recursive: true })

  console.log(`🔗 Mounting ${device} to ${mountPoint}...`)
  const result = await runCommand(["mount", device, mountPoint], {
    sudo: true,
  })

  if (!result.success) {
    throw new Error(`Failed to mount: ${result.error}`)
  }

  console.log("✅ Drive mounted successfully")
}

async function unmountDrive(mountPoint: string): Promise<void> {
  console.log(`📤 Unmounting ${mountPoint}...`)
  const result = await runCommand(["umount", mountPoint], { sudo: true })

  if (!result.success) {
    console.warn(`⚠️  Warning: Failed to unmount: ${result.error}`)
  } else {
    console.log("✅ Drive unmounted successfully")
  }

  // Clean up mount point
  try {
    await Deno.remove(mountPoint)
  } catch {
    // Ignore errors
  }
}

async function formatDrive(device: string): Promise<void> {
  console.log(`⚠️  WARNING: This will ERASE ALL DATA on ${device}!`)
  console.log("Device info:")

  const drives = await listDrives()
  const drive = drives.find((d) => d.name === device.replace("/dev/", ""))
  if (drive) {
    console.log(`  Name: ${drive.name}`)
    console.log(`  Size: ${drive.size}`)
    console.log(`  Model: ${drive.model}`)
  }

  const confirmation = prompt("\nType 'YES' to continue: ")
  if (confirmation !== "YES") {
    console.log("❌ Formatting cancelled")
    Deno.exit(0)
  }

  console.log("\n🔧 Creating GPT partition table...")
  let result = await runCommand(
    ["parted", device, "--script", "mklabel", "gpt"],
    { sudo: true },
  )
  if (!result.success) {
    throw new Error(`Failed to create partition table: ${result.error}`)
  }

  console.log("🔧 Creating primary partition...")
  result = await runCommand(
    ["parted", device, "--script", "mkpart", "primary", "btrfs", "0%", "100%"],
    { sudo: true },
  )
  if (!result.success) {
    throw new Error(`Failed to create partition: ${result.error}`)
  }

  // Wait for partition to be created
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const partition = `${device}1`
  console.log(`💾 Formatting ${partition} with BTRFS...`)
  result = await runCommand(
    ["mkfs.btrfs", "-f", "-L", "OfflineBackups", partition],
    { sudo: true },
  )
  if (!result.success) {
    throw new Error(`Failed to format: ${result.error}`)
  }

  console.log("✅ Drive formatted successfully")
}

async function createBackupStructure(mountPoint: string): Promise<void> {
  console.log("📁 Creating backup directory structure...")

  const dirs = [
    `${mountPoint}/${REPOS_DIR}`,
    `${mountPoint}/${METADATA_DIR}`,
    `${mountPoint}/${DOCS_DIR}`,
  ]

  for (const dir of dirs) {
    await runCommand(["mkdir", "-p", dir], { sudo: true })
  }

  console.log("✅ Directory structure created")
}

async function writeMetadata(
  mountPoint: string,
  localBackupsPath: string,
): Promise<void> {
  console.log("📝 Writing metadata...")

  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

  const backupInfo = `# Homelab Offline Backup

**Created:** ${now.toISOString().split("T")[0]} ${
    now.toTimeString().split(" ")[0]
  } ${Intl.DateTimeFormat().resolvedOptions().timeZone}
**Source:** ${localBackupsPath}
**Type:** Restic repositories
**Encryption:** Yes (Restic native encryption)
**Schedule:** Monthly offline backup
**Next Update Due:** ${nextMonth.toISOString().split("T")[0]}

## Important Notes

- Keep drive in protective case
- Store in climate-controlled area (20-25°C, <60% humidity)
- Keep away from magnets and water
- Update monthly
- Verify backup integrity after sync

## Password Location

Restic password is stored in the "spy4x/homelab" code repository on GitHub in: \`.env\` file as \`BACKUPS_PASSWORD\`.
Actual .env file is not committed to the repository for security.
But you can find it's content in VaultWarden (password manager) entry named \`Homelab .env\`.
Also it should be located on the local computer in \`~/dev/homelab/.env\` and on the home server in \`~/<apps_folder>/.env\`.

## Quick Restore

Connect drive and execute \`deno task offline-backup:restore\` from homelab repo.  
The script will guide you through the restore process.  
`

  // Write to temp file then move with sudo
  const tempPath = `/tmp/backup-info-${Date.now()}.md`
  await Deno.writeTextFile(tempPath, backupInfo)

  const infoPath = `${mountPoint}/${METADATA_DIR}/backup-info.md`
  const result = await runCommand(["mv", tempPath, infoPath], { sudo: true })

  if (!result.success) {
    throw new Error(`Failed to write metadata: ${result.error}`)
  }

  await runCommand(["chown", "root:root", infoPath], { sudo: true })

  console.log("✅ Metadata written")
}

async function checkDeletedRepos(
  localBackupsPath: string,
  mountPoint: string,
): Promise<boolean> {
  const expanded = localBackupsPath.replace(/^~/, Deno.env.get("HOME") || "~")
  const reposDir = `${mountPoint}/${REPOS_DIR}`

  try {
    const localRepos = new Set<string>()
    for await (const entry of Deno.readDir(expanded)) {
      if (entry.isDirectory) {
        localRepos.add(entry.name)
      }
    }

    const driveRepos: string[] = []
    for await (const entry of Deno.readDir(reposDir)) {
      if (entry.isDirectory && !localRepos.has(entry.name)) {
        driveRepos.push(entry.name)
      }
    }

    if (driveRepos.length > 0) {
      console.log("\n⚠️  WARNING: The following repositories exist on the drive but not locally:")
      console.log("   They will be DELETED from the drive:\n")
      driveRepos.forEach((repo) => console.log(`     - ${repo}`))

      const confirm = prompt("\n❓ Continue and delete these repositories? (yes/no): ")
      return confirm?.toLowerCase() === "yes"
    }
  } catch (error) {
    console.warn(`⚠️  Could not check for deleted repos: ${error}`)
  }

  return true
}

async function syncBackups(
  localBackupsPath: string,
  mountPoint: string,
): Promise<void> {
  console.log(`\n🔄 Syncing backups from ${localBackupsPath}...`)

  const expanded = localBackupsPath.replace(/^~/, Deno.env.get("HOME") || "~")
  const source = `${expanded}/`
  const target = `${mountPoint}/${REPOS_DIR}/`

  console.log(`   Source: ${source}`)
  console.log(`   Target: ${target}`)

  // Spawn rsync with real-time output
  const proc = new Deno.Command("sudo", {
    args: [
      "rsync",
      "-avh",
      "--info=progress2",
      "--delete",
      "--exclude=.sync*",
      "--exclude=*.tmp",
      source,
      target,
    ],
    stdout: "piped",
    stderr: "piped",
  })

  const child = proc.spawn()
  const decoder = new TextDecoder()
  let lastProgress = 0

  // Read stdout in chunks
  const reader = child.stdout.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split("\n")

      for (const line of lines) {
        // Parse rsync progress: "  1.23G  45%  123.45MB/s"
        const match = line.match(/(\d+)%/)
        if (match) {
          const progress = parseInt(match[1])
          // Show progress every 5%
          if (progress >= lastProgress + 5) {
            const sizeMatch = line.match(/([\d.]+[KMGT]?)/)
            const speedMatch = line.match(/([\d.]+[KMGT]?B\/s)/)
            let msg = `   Progress: ${progress}%`
            if (sizeMatch) msg += ` (${sizeMatch[1]})`
            if (speedMatch) msg += ` @ ${speedMatch[1]}`
            console.log(msg)
            lastProgress = progress
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const status = await child.status
  if (!status.success) {
    const errorOutput = decoder.decode(await child.stderr.arrayBuffer())
    throw new Error(`Rsync failed: ${errorOutput}`)
  }

  console.log("✅ Sync completed")
}

async function verifyBackups(
  mountPoint: string,
  resticPassword: string,
): Promise<void> {
  console.log("\\n🔍 Verifying backup integrity (5% data sample)...")

  // Check if restic is installed
  const resticCheck = await runCommand(["which", "restic"])
  if (!resticCheck.success) {
    console.log("⚠️  Restic not found, skipping verification")
    console.log("   Install restic to enable backup verification")
    return
  }

  const reposDir = `${mountPoint}/${REPOS_DIR}`

  // List all repos
  const repos: string[] = []
  try {
    for await (const entry of Deno.readDir(reposDir)) {
      if (entry.isDirectory) {
        repos.push(`${reposDir}/${entry.name}`)
      }
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not list repos: ${error}`)
    return
  }

  if (repos.length === 0) {
    console.log("ℹ️  No repositories found to verify")
    return
  }

  const results: Array<{ name: string; success: boolean; error?: string }> = []

  for (const repo of repos) {
    const name = repo.split("/").pop() || "unknown"
    console.log(`\n  Checking: ${name}...`)

    const cmd = new Deno.Command("restic", {
      args: ["-r", repo, "check", "--read-data-subset=5%"],
      env: {
        ...Deno.env.toObject(),
        RESTIC_PASSWORD: resticPassword,
      },
      stdout: "piped",
      stderr: "piped",
    })

    const output = await cmd.output()
    const success = output.code === 0

    if (success) {
      console.log(`  ✅ ${name}: OK`)
    } else {
      const error = new TextDecoder().decode(output.stderr)
      console.log(`  ❌ ${name}: FAILED`)
      console.log(`     ${error.split("\n")[0]}`)
      results.push({ name, success: false, error })
      continue
    }

    results.push({ name, success: true })
  }

  // Write verification log
  const logPath = `${mountPoint}/${METADATA_DIR}/verification-log.txt`
  const log = `Verification Date: ${new Date().toISOString()}
Total Repositories: ${repos.length}
Successful: ${results.filter((r) => r.success).length}
Failed: ${results.filter((r) => !r.success).length}

Details:
${
    results.map((r) =>
      `  ${r.name}: ${
        r.success ? "OK" : "FAILED" + (r.error ? ` - ${r.error.split("\n")[0]}` : "")
      }`
    ).join("\n")
  }
`

  const tempPath = `/tmp/verification-log-${Date.now()}.txt`
  await Deno.writeTextFile(tempPath, log)
  await runCommand(["mv", tempPath, logPath], { sudo: true })
  await runCommand(["chown", "root:root", logPath], { sudo: true })

  console.log("\n✅ Verification complete")

  const failed = results.filter((r) => !r.success)
  if (failed.length > 0) {
    console.warn(
      `\n⚠️  Warning: ${failed.length} repository verification(s) failed`,
    )
  }
}

async function logSync(mountPoint: string): Promise<void> {
  const logPath = `${mountPoint}/${METADATA_DIR}/sync-log.txt`
  const entry = `${new Date().toISOString()} - Backup sync completed successfully\n`

  try {
    // Write to temp file then append with sudo
    const tempPath = `/tmp/sync-log-${Date.now()}.txt`
    await Deno.writeTextFile(tempPath, entry)

    // Check if log file exists
    try {
      await Deno.stat(logPath)
      // Append to existing file
      await runCommand(["sh", "-c", `cat ${tempPath} >> ${logPath}`], { sudo: true })
    } catch {
      // Create new file
      await runCommand(["mv", tempPath, logPath], { sudo: true })
    }

    await runCommand(["chown", "root:root", logPath], { sudo: true })

    // Clean up temp file
    try {
      await Deno.remove(tempPath)
    } catch {
      // Ignore
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not write sync log: ${error}`)
  }
}

async function create(envVars: Record<string, string>): Promise<void> {
  const localBackupsPath = envVars.LOCAL_BACKUPS_PATH
  const resticPassword = envVars.BACKUPS_PASSWORD

  // Expand path
  const expanded = localBackupsPath.replace(
    /^~/,
    Deno.env.get("HOME") || "~",
  )

  // Check if source exists
  try {
    const stat = await Deno.stat(expanded)
    if (!stat.isDirectory) {
      console.error(`❌ Error: ${expanded} is not a directory`)
      Deno.exit(1)
    }
  } catch {
    console.error(`❌ Error: ${expanded} does not exist`)
    Deno.exit(1)
  }

  console.log("\n=== Offline Backup - Create Mode ===\n")

  // List drives
  console.log("📋 Available drives:\n")
  const drives = await listDrives()

  if (drives.length === 0) {
    console.error("❌ No drives found")
    Deno.exit(1)
  }

  drives.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.name} - ${d.size} - ${d.model}`)
  })

  // Get drive selection
  const driveInput = prompt("\n🔍 Enter drive name (e.g., 'sda'): ");
  if (!driveInput) {
    console.log("❌ No drive selected");
    Deno.exit(0);
  }

  const driveName = driveInput.trim();
  const device = `/dev/${driveName}`
  const partition = `${device}1`

  // Verify drive exists
  if (!(await checkDriveExists(driveName))) {
    console.error(`❌ Error: Drive ${device} does not exist`)
    Deno.exit(1)
  }

  // Check if drive needs formatting
  const needsFormat = prompt(
    "\n❓ Does this drive need formatting? (yes/no) [no]: ",
  )
  if (needsFormat?.toLowerCase() === "yes") {
    await formatDrive(device)
  }

  // Mount drive
  try {
    if (await isMounted(partition)) {
      console.log(`ℹ️  ${partition} is already mounted`)
      const mountInfo = await runCommand(["mount"])
      const mountLine = mountInfo.output.split("\n").find((l) => l.includes(partition))
      if (mountLine) {
        const currentMount = mountLine.split(" ")[2]
        console.log(`   Current mount point:${currentMount}`)
        const useExisting = prompt("Use this mount point? (yes/no): ")
        if (useExisting?.toLowerCase() !== "yes") {
          await unmountDrive(currentMount)
          await mountDrive(partition, MOUNT_POINT)
        } else {
          // Use existing mount point
          Object.assign(globalThis, { MOUNT_POINT: currentMount })
        }
      }
    } else {
      await mountDrive(partition, MOUNT_POINT)
    }

    // Create structure
    await createBackupStructure(MOUNT_POINT)

    // Write metadata
    await writeMetadata(MOUNT_POINT, localBackupsPath)

    // Check for repositories that will be deleted
    if (!(await checkDeletedRepos(localBackupsPath, MOUNT_POINT))) {
      console.log("❌ Operation cancelled")
      await unmountDrive(MOUNT_POINT)
      Deno.exit(0)
    }

    // Sync backups
    await syncBackups(localBackupsPath, MOUNT_POINT)

    // Verify backups
    await verifyBackups(MOUNT_POINT, resticPassword)

    // Log sync
    await logSync(MOUNT_POINT)

    console.log("\n✅ Backup completed successfully!")
    console.log(
      `\n📊 Drive usage: ${(await runCommand(["df", "-h", MOUNT_POINT])).output.split("\n")[1]}`,
    )
    console.log(`\nTo safely remove drive:`)
    console.log(`  sudo umount ${MOUNT_POINT}`)
    console.log(`  sudo eject ${device}`)
  } catch (error) {
    console.error(`\n❌ Error during backup: ${error}`)

    // Try to unmount on error
    try {
      await unmountDrive(MOUNT_POINT)
    } catch {
      // Ignore
    }

    Deno.exit(1)
  }
}

async function restore(envVars: Record<string, string>): Promise<void> {
  const localBackupsPath = envVars.LOCAL_BACKUPS_PATH
  const resticPassword = envVars.BACKUPS_PASSWORD

  // Expand path
  const expanded = localBackupsPath.replace(
    /^~/,
    Deno.env.get("HOME") || "~",
  )

  console.log("\n=== Offline Backup - Restore Mode ===\n")
  console.log(
    "⚠️  WARNING: This will restore backups from offline drive to:",
  )
  console.log(`   ${expanded}\n`)

  // List drives
  console.log("📋 Available drives:\n")
  const drives = await listDrives()

  if (drives.length === 0) {
    console.error("❌ No drives found")
    Deno.exit(1)
  }

  drives.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.name} - ${d.size} - ${d.model}`)
  })

  // Get drive selection
  const driveInput = prompt("\n🔍 Enter drive name (e.g., 'sda'): ")
  if (!driveInput) {
    console.log("❌ No drive selected")
    Deno.exit(0)
  }

  const driveName = driveInput.trim()
  const device = `/dev/${driveName}`
  const partition = `${device}1`

  // Verify drive exists
  if (!(await checkDriveExists(driveName))) {
    console.error(`❌ Error: Drive ${device} does not exist`)
    Deno.exit(1)
  }

  // Mount drive
  try {
    if (await isMounted(partition)) {
      console.log(`ℹ️  ${partition} is already mounted`)
      const mountInfo = await runCommand(["mount"])
      const mountLine = mountInfo.output.split("\n").find((l) => l.includes(partition))
      if (mountLine) {
        const currentMount = mountLine.split(" ")[2]
        console.log(`   Current mount point: ${currentMount}`)
        const useExisting = prompt("Use this mount point? (yes/no): ")
        if (useExisting?.toLowerCase() !== "yes") {
          await unmountDrive(currentMount)
          await mountDrive(partition, MOUNT_POINT)
        } else {
          // Use existing mount point
          Object.assign(globalThis, { MOUNT_POINT: currentMount })
        }
      }
    } else {
      await mountDrive(partition, MOUNT_POINT)
    }

    // Check if backup structure exists
    const reposDir = `${MOUNT_POINT}/${REPOS_DIR}`
    try {
      await Deno.stat(reposDir)
    } catch {
      console.error(`❌ Error: No backup repositories found at ${reposDir}`)
      console.error(
        "   This drive may not be an offline backup drive or is corrupted",
      )
      await unmountDrive(MOUNT_POINT)
      Deno.exit(1)
    }

    // Show metadata if available
    try {
      const metadataPath = `${MOUNT_POINT}/${METADATA_DIR}/backup-info.md`
      const metadata = await Deno.readTextFile(metadataPath)
      console.log("\n📋 Backup Information:\n")
      console.log(metadata.split("\n").slice(0, 10).join("\n"))
      console.log("\n...(truncated)\n")
    } catch {
      console.log("\nℹ️  No metadata found\n")
    }

    // Confirm restore
    const confirm = prompt(
      "\n⚠️  Type 'RESTORE' to restore all backups to local folder: ",
    )
    if (confirm !== "RESTORE") {
      console.log("❌ Restore cancelled")
      await unmountDrive(MOUNT_POINT)
      Deno.exit(0)
    }

    // Create target directory if it doesn't exist
    await Deno.mkdir(expanded, { recursive: true })

    // Sync from drive to local
    console.log(`\n🔄 Restoring backups to ${expanded}...`)

    const source = `${reposDir}/`
    const target = `${expanded}/`

    const result = await runCommand(
      [
        "rsync",
        "-avhP",
        "--delete",
        source,
        target,
      ],
      { sudo: true },
    )

    if (!result.success) {
      throw new Error(`Rsync failed: ${result.error}`)
    }

    console.log("✅ Restore completed")

    // Verify restored backups
    console.log("\n🔍 Verifying restored backups...")
    await verifyBackups(expanded.replace(`/${REPOS_DIR}`, ""), resticPassword)

    console.log("\n✅ Restore completed successfully!")
    console.log(`\nBackups restored to: ${expanded}`)
    console.log(`\nTo safely remove drive:`)
    console.log(`  sudo umount ${MOUNT_POINT}`)
    console.log(`  sudo eject ${device}`)
  } catch (error) {
    console.error(`\n❌ Error during restore: ${error}`)

    // Try to unmount on error
    try {
      await unmountDrive(MOUNT_POINT)
    } catch {
      // Ignore
    }

    Deno.exit(1)
  }
}

function showHelp(): void {
  console.log(`
🗄️  Offline Backup Manager

Usage:
  deno task offline-backup <command>

Commands:
  create    Create offline backup on external drive
  restore   Restore backups from external drive to local folder
  help      Show this help message

Environment Variables Required:
  LOCAL_BACKUPS_PATH   Path to local backups folder (e.g., ~/sync/backups)
  BACKUPS_PASSWORD     Restic repository password

Examples:
  # Create offline backup on external drive
  deno task offline-backup create

  # Restore from external drive
  deno task offline-backup restore

  # Show help
  deno task offline-backup help

Features:
  - Automatic drive detection and selection
  - BTRFS formatting wit compression
  - Rsync with progress display
  - Restic integrity verification (5% data sample)
  - Metadata ad documentation generation
  - Safe mount/umount handling

Storage Recommendations for Singapore:
  - Store in dry cabinet 40-50% RH) or sealed container with desiccant
  - Keep in air-conditioned room (20-25°C)
  - Update monthly
  - Keep away from magnets, water, and direct sunlight
`)
}

async function main(): Promise<void> {
  const args = Deno.args

  if (args.length === 0 || args[0] === "help") {
    showHelp()
    Deno.exit(0)
  }

  const command = args[0]

  if (!["create", "restore"].includes(command)) {
    console.error(`❌ Error: Unknown command '${command}'`)
    console.error("   Run 'deno task offline-backup help' for usage")
    Deno.exit(1)
  }

  // Load environment variables
  console.log("🔧 Loading environment variables...")
  const envVars = await loadEnvFile(".env")

  // Check required env vars
  const required = ["LOCAL_BACKUPS_PATH", "BACKUPS_PASSWORD"]
  const missing = required.filter((key) => !envVars[key])

  if (missing.length > 0) {
    console.error(`❌ Error: Missing required environment variables:`)
    missing.forEach((key) => console.error(`   - ${key}`))
    console.error("\nAdd these to your .env file")
    Deno.exit(1)
  }

  console.log("✅ Environment variables loaded")

  // Execute command
  if (command === "create") {
    await create(envVars)
  } else if (command === "restore") {
    await restore(envVars)
  }
}

if (import.meta.main) {
  main()
}
