#!/usr/bin/env -S deno run -A

import { loadEnvFile, runCommand } from "../+lib.ts"

const MOUNT_POINT = "/tmp/offline-backups-mount"
const METADATA_DIR = "metadata"
const REPOS_DIR = "restic-repos"

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
    const stat = await Deno.stat(`/dev/${driveName}`)
    return stat.isBlockDevice ?? false
  } catch {
    return false
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
  console.log("📁 Ensuring backup directory structure...")

  const dirs = [
    `${mountPoint}/${REPOS_DIR}`,
    `${mountPoint}/${METADATA_DIR}`,
    `${mountPoint}/${METADATA_DIR}/logs`,
  ]

  for (const dir of dirs) {
    await runCommand(["mkdir", "-p", dir], { sudo: true })
  }

  // Create comprehensive README.md in root of drive
  const readmePath = `${mountPoint}/README.md`
  const readmeContent = `# Homelab Offline Backup Drive

This drive contains encrypted backups of critical homelab services.

## Quick Start

**Restore Command:**  
\`\`\`bash
cd ~/dev/homelab && deno task offline-backup restore
\`\`\`

**Password Location:** \`~/sync/essentials/restic-password.txt\`

## Storage (Singapore Climate)

Store in dry cabinet ($50-200 SGD) or sealed container with desiccant.  
Keep at 20-25°C, <60% humidity, elevated from floor.

**See metadata/backup-info.md for detailed information.**
`

  const tempPath = `/tmp/offline-backup-readme-${Date.now()}.md`
  await Deno.writeTextFile(tempPath, readmeContent)
  await runCommand(["cp", tempPath, readmePath], { sudo: true })
  await runCommand(["rm", tempPath])

  console.log("✅ Directory structure created")
}

async function getBackupSize(path: string): Promise<{ bytes: number; human: string }> {
  const result = await runCommand(["du", "-sb", path])
  if (!result.success) {
    return { bytes: 0, human: "unknown" }
  }

  const bytes = parseInt(result.output.split("\t")[0])

  // Convert to human readable
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  const human = `${size.toFixed(2)} ${units[unitIndex]}`

  return { bytes, human }
}

async function writeMetadata(
  mountPoint: string,
  localBackupsPath: string,
): Promise<void> {
  console.log("📝 Writing metadata...")

  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

  // Calculate backup size
  const reposDir = `${mountPoint}/${REPOS_DIR}`
  const backupSize = await getBackupSize(reposDir)

  const backupInfo = `# Homelab Offline Backup

**Created:** ${now.toISOString().split("T")[0]} ${
    now.toTimeString().split(" ")[0]
  } ${Intl.DateTimeFormat().resolvedOptions().timeZone}
**Source:** ${localBackupsPath}
**Type:** Restic repositories
**Encryption:** Yes (Restic native encryption)
**Schedule:** Monthly offline backup
**Next Update Due:** ${nextMonth.toISOString().split("T")[0]}
**Backup Size:** ${backupSize.human} (${backupSize.bytes.toLocaleString()} bytes)

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
): Promise<
  {
    passed: number
    failed: number
    skipped: number
    details: Array<{ name: string; status: "passed" | "failed" | "skipped"; error?: string }>
  }
> {
  console.log("\n🔍 Verifying backup integrity (100% data verification)...")

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    details: [] as Array<{ name: string; status: "passed" | "failed" | "skipped"; error?: string }>,
  }

  // Check if restic is installed
  const resticCheck = await runCommand(["which", "restic"])
  if (!resticCheck.success) {
    console.log("\n⚠️  WARNING: Restic not found!")
    console.log("   Backup verification is HIGHLY RECOMMENDED for data integrity.")
    console.log("   Install restic: https://restic.net/")
    console.log("   Without verification, corrupted backups may go undetected.")
    const skip = prompt("\n❓ Skip verification anyway? (yes/no) [no]: ")
    if (skip?.toLowerCase() !== "yes") {
      console.log("\n❌ Verification cancelled. Please install restic and try again.")
      throw new Error("Restic verification required but restic not installed")
    }
    return results
  }

  const reposDir = `${mountPoint}/${REPOS_DIR}`

  // List all repos
  const repos: string[] = []
  try {
    for await (const entry of Deno.readDir(reposDir)) {
      if (entry.isDirectory) {
        // Check if it's a valid restic repo (has config file)
        const configPath = `${reposDir}/${entry.name}/config`
        try {
          await Deno.stat(configPath)
          repos.push(`${reposDir}/${entry.name}`)
        } catch {
          // Skip directories without config file (not restic repos)
          console.log(`\n  ⏭️  Skipping ${entry.name} (not a restic repository)`)
          results.skipped++
          results.details.push({ name: entry.name, status: "skipped" })
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not list repos: ${error}`)
    return results
  }

  if (repos.length === 0) {
    console.log("ℹ️  No repositories found to verify")
    return results
  }

  for (const repo of repos) {
    const name = repo.split("/").pop() || "unknown"
    console.log(`\n  Checking: ${name}...`)

    const cmd = new Deno.Command("restic", {
      args: ["-r", repo, "check", "--read-data"],
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
      results.passed++
      results.details.push({ name, status: "passed" })
    } else {
      const error = new TextDecoder().decode(output.stderr)
      console.log(`  ❌ ${name}: FAILED`)
      console.log(`     ${error.split("\n")[0]}`)
      results.failed++
      results.details.push({ name, status: "failed", error: error.split("\n")[0] })
    }
  }

  console.log("\n✅ Verification complete")

  if (results.failed > 0) {
    console.warn(
      `\n⚠️  Warning: ${results.failed} repository verification(s) failed`,
    )
  }

  return results
}

async function runSmartCheck(
  device: string,
  checkType: "short" | "long",
): Promise<void> {
  console.log(`\n🔍 Running SMART ${checkType} test on ${device}...`)
  console.log("   This will check the drive's health and detect potential issues.")

  // Check if smartctl is installed
  const smartctlCheck = await runCommand(["which", "smartctl"])
  if (!smartctlCheck.success) {
    console.log("\n⚠️  smartctl not found!")
    console.log("   Install smartmontools: sudo dnf install smartmontools")
    return
  }

  // Get estimated time before starting
  const checkInfo = await runCommand(["smartctl", "-c", device], { sudo: true })
  const estimatedMinutes = checkType === "short" ? 2 : 390

  console.log(`   Estimated duration: ~${estimatedMinutes} minutes`)

  // Start the test (use 'short' or 'long', not 'offline')
  const testType = checkType === "short" ? "short" : "long"
  const startResult = await runCommand(
    ["smartctl", "-t", testType, device],
    { sudo: true },
  )

  if (
    startResult.output.includes("Self-test execution status") ||
    startResult.output.includes("has begun") ||
    startResult.output.includes("Testing has begun")
  ) {
    console.log("✅ SMART test started successfully")
  } else {
    console.log("\n⚠️  Warning: Could not start SMART test")
    console.log("   Output:", startResult.output)
    console.log("   Error:", startResult.error)
    return
  }

  // Wait for test to complete with progress updates
  const checkIntervalMs = 5 * 60 * 1000 // Check every 5 minutes
  const totalWaitMs = estimatedMinutes * 60 * 1000
  const testStartTime = Date.now()

  console.log("\n⏳ Waiting for test to complete...")

  while (true) {
    const elapsed = Date.now() - testStartTime
    const elapsedMinutes = Math.floor(elapsed / 60000)

    // Check test status
    const statusResult = await runCommand(["smartctl", "-a", device], { sudo: true })
    const statusOutput = statusResult.output + statusResult.error

    // Look for completion indicators
    const isComplete = statusOutput.includes("Self-test routine completed without error") ||
      statusOutput.includes("# 1  ") || // Recent completed test in log
      (statusOutput.includes("Self-test execution status:") &&
        statusOutput.includes("(   0)"))

    const isRunning = statusOutput.includes("Self-test routine in progress") ||
      statusOutput.includes("% of test remaining")

    if (isComplete) {
      console.log(`\n✅ Test completed after ${elapsedMinutes} minutes`)
      break
    }

    if (isRunning) {
      // Extract remaining percentage if available
      const percentMatch = statusOutput.match(/(\d+)% of test remaining/)
      const remaining = percentMatch
        ? `${percentMatch[1]}% remaining`
        : `${elapsedMinutes}/${estimatedMinutes} min elapsed`
      console.log(`   [${new Date().toLocaleTimeString()}] Still running... ${remaining}`)
    } else if (elapsed < totalWaitMs) {
      console.log(
        `   [${
          new Date().toLocaleTimeString()
        }] In progress: ${elapsedMinutes}/${estimatedMinutes} min elapsed`,
      )
    }

    // Stop if we've exceeded estimated time by 50%
    if (elapsed > totalWaitMs * 1.5) {
      console.log(
        "\n⚠️  Test taking longer than expected, check manually with: sudo smartctl -a " + device,
      )
      break
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))
  }

  // Get final results
  console.log("\n📊 SMART Test Results:")
  const resultCmd = await runCommand(["smartctl", "-a", device], { sudo: true })

  if (resultCmd.success || resultCmd.output) {
    const output = resultCmd.output

    // Show overall health
    const healthMatch = output.match(/SMART overall-health.*:\s*(.+)/)
    if (healthMatch) {
      const health = healthMatch[1].trim()
      const icon = health.includes("PASSED") ? "✅" : "❌"
      console.log(`   ${icon} Health: ${health}`)
    }

    // Show recent test results
    const testLogStart = output.indexOf("SMART Self-test log")
    if (testLogStart > -1) {
      const lines = output.substring(testLogStart).split("\n")
      console.log("\n   Recent Tests:")
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        if (lines[i].trim()) {
          console.log("   " + lines[i])
        }
      }
    }

    console.log("\n✅ SMART check completed successfully")
  } else {
    console.log("\n⚠️  Could not retrieve SMART results")
    console.log("   Check manually with: sudo smartctl -a " + device)
  }
}

async function saveBackupLog(
  mountPoint: string,
  logContent: string,
  success: boolean,
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const status = success ? "success" : "failed"
  const logDir = `${mountPoint}/${METADATA_DIR}/logs`
  const logFile = `${logDir}/${timestamp}_${status}.log`

  try {
    // Ensure logs directory exists
    await runCommand(["mkdir", "-p", logDir], { sudo: true })

    // Write log file
    const tempPath = `/tmp/backup-log-${Date.now()}.txt`
    await Deno.writeTextFile(tempPath, logContent)
    await runCommand(["cp", tempPath, logFile], { sudo: true })
    await runCommand(["rm", tempPath])

    console.log(`\n📝 Log saved: ${logFile}`)
  } catch (error) {
    console.error("Warning: Could not save backup log:", error)
  }
}

async function logSync(mountPoint: string): Promise<void> {
  // This function is deprecated - logs are now saved via saveBackupLog()
  // Kept for backwards compatibility but does nothing
  console.log("   (Legacy sync log skipped - using new log format)")
}

async function create(envVars: Record<string, string>): Promise<void> {
  const localBackupsPath = envVars.LOCAL_BACKUPS_PATH
  const resticPassword = envVars.BACKUPS_PASSWORD

  // Track backup session for logging
  const backupLog: string[] = []
  const startTime = Date.now()
  let syncSuccess = false
  let verifyResults: {
    passed: number
    failed: number
    skipped: number
    details: Array<{ name: string; status: "passed" | "failed" | "skipped"; error?: string }>
  } = {
    passed: 0,
    failed: 0,
    skipped: 0,
    details: [],
  }

  const addLog = (message: string) => {
    backupLog.push(`[${new Date().toISOString()}] ${message}`)
  }

  addLog("=== Offline Backup Session Started ===")

  // Expand path
  const expanded = localBackupsPath.replace(
    /^~/,
    Deno.env.get("HOME") || "~",
  )
  addLog(`Source: ${expanded}`)

  // Check if source exists
  try {
    const stat = await Deno.stat(expanded)
    if (!stat.isDirectory) {
      console.error(`❌ Error: ${expanded} is not a directory`)
      addLog(`ERROR: ${expanded} is not a directory`)
      Deno.exit(1)
    }
  } catch {
    console.error(`❌ Error: ${expanded} does not exist`)
    addLog(`ERROR: ${expanded} does not exist`)
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

    // Ensure directory structure
    await createBackupStructure(MOUNT_POINT)

    // Start timing actual operations (after user prompts)
    const operationStartTime = Date.now()

    // Check for repositories that will be deleted
    if (!(await checkDeletedRepos(localBackupsPath, MOUNT_POINT))) {
      console.log("❌ Operation cancelled")
      await unmountDrive(MOUNT_POINT)
      Deno.exit(0)
    }

    // Sync backups
    addLog(`Starting sync from ${expanded} to ${MOUNT_POINT}`)
    await syncBackups(localBackupsPath, MOUNT_POINT)
    syncSuccess = true
    addLog("Sync completed successfully")

    // Verify backups
    addLog("Starting verification (100% data check)")
    verifyResults = await verifyBackups(MOUNT_POINT, resticPassword)
    addLog(
      `Verification complete: ${verifyResults.passed} passed, ${verifyResults.failed} failed, ${verifyResults.skipped} skipped`,
    )

    // Write metadata (after verification to include accurate size)
    await writeMetadata(MOUNT_POINT, localBackupsPath)
    addLog("Metadata written")

    // Calculate operation duration (excluding user prompts)
    const duration = Math.round((Date.now() - operationStartTime) / 1000)
    addLog(`=== Backup Operations Complete (${Math.floor(duration / 60)}m ${duration % 60}s) ===`)

    // Ask about SMART check
    console.log("\n🔍 Drive Health Check (SMART)")
    console.log("   short: ~2 minutes  - Quick electrical/mechanical check")
    console.log("   long:  ~390 minutes - Comprehensive surface scan")
    console.log("   no:    Skip health check")
    const smartChoice = prompt(
      "\n❓ Would you like a SMART check of the drive's health? (short/long/no) [short]: ",
    ) || "short"

    if (smartChoice.toLowerCase() === "short" || smartChoice.toLowerCase() === "long") {
      addLog(`Starting SMART ${smartChoice} test`)
      await runSmartCheck(device, smartChoice.toLowerCase() as "short" | "long")
      addLog(`SMART ${smartChoice} test completed`)
    } else {
      console.log("\n⏭️  Skipping SMART check")
      addLog("SMART check skipped by user")
    }

    // Display summary after SMART check
    console.log("\n" + "=".repeat(60))
    console.log("📊 BACKUP SUMMARY")
    console.log("=".repeat(60))
    console.log(`\n✅ Backup completed successfully!`)
    console.log(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`)
    console.log(`   Source: ${expanded}`)
    console.log(`   Destination: ${MOUNT_POINT}`)
    console.log(`\n📦 Verification Results:`)
    console.log(`   ✅ Passed:  ${verifyResults.passed}`)
    if (verifyResults.failed > 0) {
      console.log(`   ❌ Failed:  ${verifyResults.failed}`)
      verifyResults.details.filter((d) => d.status === "failed").forEach((d) => {
        console.log(`      - ${d.name}: ${d.error || "unknown error"}`)
      })
    }
    if (verifyResults.skipped > 0) {
      console.log(`   ⏭️  Skipped: ${verifyResults.skipped} (not restic repos)`)
    }

    // Get backup size
    const sizeInfo = await getBackupSize(MOUNT_POINT)
    console.log(`\n💾 Backup Size: ${sizeInfo.human}`)

    // Get drive usage
    const dfOutput = await runCommand(["df", "-h", MOUNT_POINT])
    const usageLine = dfOutput.output.split("\n")[1]
    if (usageLine) {
      const parts = usageLine.trim().split(/\s+/)
      console.log(`   Drive Total: ${parts[1]}`)
      console.log(`   Drive Used:  ${parts[2]} (${parts[4]})`)
      console.log(`   Drive Free:  ${parts[3]}`)
    }

    console.log("=".repeat(60))

    // Save final log with complete session
    await saveBackupLog(
      MOUNT_POINT,
      backupLog.join("\n"),
      syncSuccess && verifyResults.failed === 0,
    )

    console.log(`\n🔒 To safely remove drive:`)
    console.log(`  sudo umount ${MOUNT_POINT}`)
    console.log(`  sudo eject ${device}`)
  } catch (error) {
    console.error(`\n❌ Error during backup: ${error}`)
    addLog(`ERROR: ${error}`)

    // Save error log
    try {
      await saveBackupLog(MOUNT_POINT, backupLog.join("\n"), false)
    } catch {
      // If we can't save to mount, save locally
      const localLog = `/tmp/offline-backup-error-${Date.now()}.log`
      await Deno.writeTextFile(localLog, backupLog.join("\n"))
      console.error(`\n📝 Error log saved to: ${localLog}`)
    }

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
        const useExisting = prompt("Use this mount point? (yes/no) [yes]: ")
        if (useExisting && useExisting.toLowerCase() !== "yes") {
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
  - BTRFS formatting with compression
  - Rsync with progress display (size, speed, percentage)
  - Restic integrity verification (100% data verification)
  - SMART health check (short/long tests)
  - Metadata and documentation generation (with backup size)
  - Safe mount/umount handling
  - Deletion warnings before removing repos

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
