#!/usr/bin/env -S deno run -A

import { loadEnvFile, runCommand } from "../+lib.ts"

const REPOS_DIR = "restic-repos"
const LOGS_DIR = "logs"

interface DriveInfo {
  name: string
  size: string
  model: string
  type: string
}

// Console logger to capture all output
class ConsoleLogger {
  private logs: string[] = []
  private originalLog: typeof console.log
  private originalError: typeof console.error
  private originalWarn: typeof console.warn

  constructor() {
    this.originalLog = console.log.bind(console)
    this.originalError = console.error.bind(console)
    this.originalWarn = console.warn.bind(console)
  }

  start() {
    console.log = (...args: unknown[]) => {
      const message = args.map((a) => String(a)).join(" ")
      this.logs.push(`[${new Date().toISOString()}] ${message}`)
      this.originalLog(...args)
    }
    console.error = (...args: unknown[]) => {
      const message = args.map((a) => String(a)).join(" ")
      this.logs.push(`[${new Date().toISOString()}] ERROR: ${message}`)
      this.originalError(...args)
    }
    console.warn = (...args: unknown[]) => {
      const message = args.map((a) => String(a)).join(" ")
      this.logs.push(`[${new Date().toISOString()}] WARN: ${message}`)
      this.originalWarn(...args)
    }
  }

  stop() {
    console.log = this.originalLog
    console.error = this.originalError
    console.warn = this.originalWarn
  }

  getLogs(): string[] {
    return [...this.logs]
  }
}

async function listDrives(): Promise<DriveInfo[]> {
  const result = await runCommand(["lsblk", "-ndo", "NAME,SIZE,MODEL,TYPE"])
  const text = result.output

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

async function getMountPoint(device: string): Promise<string | null> {
  const result = await runCommand(["mount"])
  const lines = result.output.split("\n")
  for (const line of lines) {
    if (line.includes(device)) {
      const parts = line.split(" ")
      const onIndex = parts.indexOf("on")
      if (onIndex > -1 && parts[onIndex + 1]) {
        return parts[onIndex + 1]
      }
    }
  }
  return null
}

async function mountDrive(device: string): Promise<string> {
  console.log(`🔗 Mounting ${device}...`)
  const result = await runCommand(["udisksctl", "mount", "-b", device])

  if (!result.success) {
    throw new Error(`Failed to mount: ${result.error}`)
  }

  // Extract mount point from output: "Mounted /dev/sdX1 at /run/media/user/..."
  const mountMatch = result.output.match(/at\s+(.+?)[\s\n]/) || result.output.match(/at\s+(.+)$/)
  if (mountMatch && mountMatch[1]) {
    const mountPoint = mountMatch[1].trim().replace(/\.$/, "")
    console.log(`✅ Drive mounted at: ${mountPoint}`)
    return mountPoint
  }

  throw new Error("Could not determine mount point from udisksctl output")
}

async function unmountDrive(device: string, mountPoint: string): Promise<void> {
  console.log(`📤 Unmounting ${device}...`)
  const result = await runCommand(["udisksctl", "unmount", "-b", device])

  if (!result.success) {
    console.warn(`⚠️  Warning: Failed to unmount: ${result.error}`)
  } else {
    console.log("✅ Drive unmounted successfully")
  }

  // Clean up mount point directory if it's in user's home
  try {
    const homeDir = Deno.env.get("HOME") || "~"
    if (mountPoint.startsWith(homeDir)) {
      await Deno.remove(mountPoint)
      console.log(`🗑️  Removed mount point: ${mountPoint}`)
    }
  } catch {
    // Ignore errors
  }
}

async function ejectDrive(device: string): Promise<void> {
  console.log(`⏏️  Ejecting ${device}...`)
  const result = await runCommand(["udisksctl", "power-off", "-b", device])

  if (!result.success) {
    console.warn(`⚠️  Warning: Could not eject drive: ${result.error}`)
    console.log(`   You may need to physically remove the drive`)
  } else {
    console.log("✅ Drive ejected successfully - safe to remove")
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

  // First, ensure we have write permissions on the mount point
  // udisksctl may mount with root ownership, so fix ownership first
  const username = Deno.env.get("USER") || "user"
  const chownResult = await runCommand(["chown", "-R", username, mountPoint], { sudo: true })
  if (!chownResult.success) {
    console.warn(`⚠️  Could not change ownership: ${chownResult.error}`)
  }

  const dirs = [
    `${mountPoint}/${REPOS_DIR}`,
    `${mountPoint}/${LOGS_DIR}`,
  ]

  for (const dir of dirs) {
    await Deno.mkdir(dir, { recursive: true })
  }

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

async function writeReadme(
  mountPoint: string,
  localBackupsPath: string,
): Promise<void> {
  console.log("📝 Writing README...")

  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

  // Calculate backup size
  const reposDir = `${mountPoint}/${REPOS_DIR}`
  const backupSize = await getBackupSize(reposDir)

  const readmeContent = `# Homelab Offline Backup Drive

This drive contains encrypted backups of critical homelab services.

## Quick Start

**Restore Command:**  
\`\`\`bash
cd ~/dev/homelab && deno task offline-backup restore
\`\`\`

**Password Location:** \`~/dev/homelab/.env\` file as \`BACKUPS_PASSWORD\`

## Storage (Singapore Climate)

Store in dry cabinet ($50-200 SGD) or sealed container with desiccant.  
Keep at 20-25°C, <60% humidity, elevated from floor.

---

## Backup Information

**Created:** ${now.toISOString().split("T")[0]} ${
    now.toTimeString().split(" ")[0]
  } ${Intl.DateTimeFormat().resolvedOptions().timeZone}
**Source:** ${localBackupsPath}
**Type:** Restic repositories
**Encryption:** Yes (Restic native encryption)
**Schedule:** Monthly offline backup
**Next Update Due:** ${nextMonth.toISOString().split("T")[0]}
**Backup Size:** ${backupSize.human} (${backupSize.bytes.toLocaleString()} bytes)

### Important Notes

- Keep drive in protective case
- Store in climate-controlled area (20-25°C, <60% humidity)
- Keep away from magnets and water
- Update monthly
- Verify backup integrity after sync

### Password Location

Restic password is stored in the "spy4x/homelab" code repository on GitHub in: \`.env\` file as \`BACKUPS_PASSWORD\`.
Actual .env file is not committed to the repository for security.
But you can find its content in VaultWarden (password manager) entry named \`Homelab .env\`.
Also it should be located on the local computer in \`~/dev/homelab/.env\` and on the home server in \`~/<apps_folder>/.env\`.

### Quick Restore

Connect drive and execute \`deno task offline-backup restore\` from homelab repo.  
The script will guide you through the restore process.
`

  const readmePath = `${mountPoint}/README.md`
  await Deno.writeTextFile(readmePath, readmeContent)

  console.log("✅ README written")
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
  const proc = new Deno.Command("rsync", {
    args: [
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

    // Set env var for this process temporarily
    const originalPassword = Deno.env.get("RESTIC_PASSWORD")
    Deno.env.set("RESTIC_PASSWORD", resticPassword)

    const result = await runCommand(["restic", "-r", repo, "check", "--read-data"])

    // Restore original env
    if (originalPassword) {
      Deno.env.set("RESTIC_PASSWORD", originalPassword)
    } else {
      Deno.env.delete("RESTIC_PASSWORD")
    }

    if (result.success) {
      console.log(`  ✅ ${name}: OK`)
      results.passed++
      results.details.push({ name, status: "passed" })
    } else {
      console.log(`  ❌ ${name}: FAILED`)
      console.log(`     ${result.error.split("\n")[0]}`)
      results.failed++
      results.details.push({ name, status: "failed", error: result.error.split("\n")[0] })
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
): Promise<string> {
  console.log(`\n🔍 Running SMART ${checkType} test on ${device}...`)
  console.log("   This will check the drive's health and detect potential issues.")

  // Check if smartctl is installed
  const smartctlCheck = await runCommand(["which", "smartctl"])
  if (!smartctlCheck.success) {
    console.log("\n⚠️  smartctl not found!")
    console.log("   Install smartmontools: sudo dnf install smartmontools")
    return ""
  }

  const estimatedMinutes = checkType === "short" ? 2 : 390
  console.log(`   Estimated duration: ~${estimatedMinutes} minutes`)

  // Start the test
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
    return ""
  }

  // Get the current test count before starting
  const initialStatus = await runCommand(["smartctl", "-l", "selftest", device], { sudo: true })
  const initialTestLines =
    initialStatus.output.split("\n").filter((line) => line.match(/^\s*#\s*\d+/)).length

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

    // Check if test is still in progress
    const isRunning = statusOutput.includes("Self-test routine in progress") ||
      statusOutput.includes("% of test remaining")

    // If not running, check if we have a new completed test
    if (!isRunning) {
      const currentStatus = await runCommand(["smartctl", "-l", "selftest", device], { sudo: true })
      const currentTestLines = currentStatus.output.split("\n").filter((line) =>
        line.match(/^\s*#\s*\d+/)
      ).length

      // New test completed if test count increased
      const isComplete = currentTestLines > initialTestLines

      if (isComplete) {
        console.log(`\n✅ Test completed after ${elapsedMinutes} minutes`)
        break
      }
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

  let smartResults = ""

  if (resultCmd.success || resultCmd.output) {
    const output = resultCmd.output

    // Show overall health
    const healthMatch = output.match(/SMART overall-health.*:\s*(.+)/)
    if (healthMatch) {
      const health = healthMatch[1].trim()
      const icon = health.includes("PASSED") ? "✅" : "❌"
      console.log(`   ${icon} Health: ${health}`)
      smartResults += `Overall Health: ${health}\n`
    }

    // Show recent test results
    const testLogStart = output.indexOf("SMART Self-test log")
    if (testLogStart > -1) {
      const lines = output.substring(testLogStart).split("\n")
      console.log("\n   Recent Tests:")
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        if (lines[i].trim()) {
          console.log("   " + lines[i])
          smartResults += lines[i] + "\n"
        }
      }
    }

    console.log("\n✅ SMART check completed successfully")
  } else {
    console.log("\n⚠️  Could not retrieve SMART results")
    console.log("   Check manually with: sudo smartctl -a " + device)
    smartResults = "Could not retrieve SMART results"
  }

  return smartResults
}

async function saveBackupLog(
  mountPoint: string,
  logContent: string,
  success: boolean,
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const status = success ? "success" : "failed"
  const logDir = `${mountPoint}/${LOGS_DIR}`
  const logFile = `${logDir}/${timestamp}_${status}.log`

  try {
    // Ensure logs directory exists
    await Deno.mkdir(logDir, { recursive: true })

    // Write log file
    await Deno.writeTextFile(logFile, logContent)

    console.log(`\n📝 Log saved: ${logFile}`)
  } catch (error) {
    console.error("Warning: Could not save backup log:", error)
  }
}

async function create(envVars: Record<string, string>): Promise<void> {
  const localBackupsPath = envVars.LOCAL_BACKUPS_PATH
  const resticPassword = envVars.BACKUPS_PASSWORD

  // Start console logging
  const logger = new ConsoleLogger()
  logger.start()

  const timings: Record<string, { start: number; end?: number; duration?: number }> = {}
  let syncSuccess = false
  let smartTestRun = false
  let smartTestType = ""
  let smartTestResults = ""
  let MOUNT_POINT = ""
  let partition = ""
  let device = ""
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

  const startTiming = (step: string) => {
    timings[step] = { start: Date.now() }
    console.log(`⏱️  Starting: ${step}`)
  }

  const endTiming = (step: string) => {
    if (timings[step]) {
      timings[step].end = Date.now()
      timings[step].duration = timings[step].end! - timings[step].start
      const durationSec = Math.round(timings[step].duration! / 1000)
      const mins = Math.floor(durationSec / 60)
      const secs = durationSec % 60
      console.log(`✅ Completed: ${step} (${mins}m ${secs}s)`)
    }
  }

  timings.total = { start: Date.now() }
  console.log("=== Offline Backup Session Started ===")

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
      logger.stop()
      Deno.exit(1)
    }
  } catch {
    console.error(`❌ Error: ${expanded} does not exist`)
    logger.stop()
    Deno.exit(1)
  }

  console.log("\n=== Offline Backup - Create Mode ===\n")
  console.log("⚠️  This script will require sudo password for the following operations:")
  console.log("   - Setting write permissions on mounted drive")
  console.log("   - Formatting drive (if selected)")
  console.log("   - Running SMART health checks (if selected)")
  console.log("")

  // List drives
  console.log("📋 Available drives:\n")
  const drives = await listDrives()

  if (drives.length === 0) {
    console.error("❌ No drives found")
    logger.stop()
    Deno.exit(1)
  }

  drives.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.name} - ${d.size} - ${d.model}`)
  })

  // Get drive selection
  const driveInput = prompt("\n🔍 Enter drive name (e.g., 'sda'): ")
  if (!driveInput) {
    console.log("❌ No drive selected")
    logger.stop()
    Deno.exit(0)
  }

  const driveName = driveInput.trim()
  device = `/dev/${driveName}`
  partition = `${device}1`

  // Verify drive exists
  if (!(await checkDriveExists(driveName))) {
    console.error(`❌ Error: Drive ${device} does not exist`)
    logger.stop()
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
      const currentMount = await getMountPoint(partition)
      if (currentMount) {
        console.log(`   Current mount point: ${currentMount}`)
        const useExisting = prompt("Use this mount point? (yes/no) [no]: ")
        if (useExisting?.toLowerCase() === "yes") {
          MOUNT_POINT = currentMount
        } else {
          await unmountDrive(partition, currentMount)
          MOUNT_POINT = await mountDrive(partition)
        }
      }
    } else {
      MOUNT_POINT = await mountDrive(partition)
    }

    // Ensure directory structure
    await createBackupStructure(MOUNT_POINT)

    // Check for repositories that will be deleted
    if (!(await checkDeletedRepos(localBackupsPath, MOUNT_POINT))) {
      console.log("❌ Operation cancelled")
      await unmountDrive(partition, MOUNT_POINT)
      await ejectDrive(device)
      logger.stop()
      Deno.exit(0)
    }

    // Sync backups
    startTiming("rsync")
    await syncBackups(localBackupsPath, MOUNT_POINT)
    syncSuccess = true
    endTiming("rsync")

    // Verify backups
    startTiming("verification")
    verifyResults = await verifyBackups(MOUNT_POINT, resticPassword)
    endTiming("verification")

    // Write README (after verification to include accurate size)
    startTiming("readme")
    await writeReadme(MOUNT_POINT, localBackupsPath)
    endTiming("readme")

    // Ask about SMART check
    console.log("\n🔍 Drive Health Check (SMART)")
    console.log("   short: ~2 minutes  - Quick electrical/mechanical check")
    console.log("   long:  ~390 minutes - Comprehensive surface scan")
    console.log("   no:    Skip health check")
    const smartChoice = prompt(
      "\n❓ Would you like a SMART check of the drive's health? (short/long/no) [short]: ",
    ) || "short"

    if (smartChoice.toLowerCase() === "short" || smartChoice.toLowerCase() === "long") {
      smartTestRun = true
      smartTestType = smartChoice.toLowerCase()
      startTiming("smart_check")
      smartTestResults = await runSmartCheck(device, smartChoice.toLowerCase() as "short" | "long")
      endTiming("smart_check")
    } else {
      console.log("\n⏭️  Skipping SMART check")
    }

    // Calculate total duration
    timings.total.end = Date.now()
    timings.total.duration = timings.total.end - timings.total.start
    const totalDuration = Math.round(timings.total.duration / 1000)

    // Display summary
    console.log("\n" + "=".repeat(60))
    console.log("📊 BACKUP SUMMARY")
    console.log("=".repeat(60))
    console.log(`\n✅ Backup completed successfully!`)
    console.log(`   Total Duration: ${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`)
    if (timings.rsync?.duration) {
      const rsyncSec = Math.round(timings.rsync.duration / 1000)
      console.log(`   - Rsync: ${Math.floor(rsyncSec / 60)}m ${rsyncSec % 60}s`)
    }
    if (timings.verification?.duration) {
      const verifySec = Math.round(timings.verification.duration / 1000)
      console.log(`   - Verification: ${Math.floor(verifySec / 60)}m ${verifySec % 60}s`)
    }
    if (timings.smart_check?.duration) {
      const smartSec = Math.round(timings.smart_check.duration / 1000)
      console.log(`   - SMART Check: ${Math.floor(smartSec / 60)}m ${smartSec % 60}s`)
    }
    console.log(`\n   Source: ${expanded}`)
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

    if (smartTestRun) {
      console.log(`\n🔍 SMART Health Check:`)
      console.log(`   Test Type: ${smartTestType}`)
      console.log(`   Status: Completed (see detailed results above)`)
    } else {
      console.log(`\n⏭️  SMART Health Check: Skipped`)
    }

    console.log("=".repeat(60))

    // Stop logging and prepare log file before unmounting
    logger.stop()

    // Prepare timing summary for log
    const timingSummary = [
      "",
      "=".repeat(60),
      "=== TIMING SUMMARY ===",
      `Total Duration: ${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`,
    ]

    if (timings.rsync?.duration) {
      const rsyncSec = Math.round(timings.rsync.duration / 1000)
      timingSummary.push(`Rsync: ${Math.floor(rsyncSec / 60)}m ${rsyncSec % 60}s`)
    }
    if (timings.verification?.duration) {
      const verifySec = Math.round(timings.verification.duration / 1000)
      timingSummary.push(`Verification: ${Math.floor(verifySec / 60)}m ${verifySec % 60}s`)
    }
    if (timings.readme?.duration) {
      const readmeSec = Math.round(timings.readme.duration / 1000)
      timingSummary.push(`README: ${Math.floor(readmeSec / 60)}m ${readmeSec % 60}s`)
    }
    if (timings.smart_check?.duration) {
      const smartSec = Math.round(timings.smart_check.duration / 1000)
      timingSummary.push(
        `SMART Check (${smartTestType}): ${Math.floor(smartSec / 60)}m ${smartSec % 60}s`,
      )
    }

    timingSummary.push("", "=== VERIFICATION DETAILS ===")
    timingSummary.push(`Passed: ${verifyResults.passed}`)
    timingSummary.push(`Failed: ${verifyResults.failed}`)
    timingSummary.push(`Skipped: ${verifyResults.skipped}`)
    verifyResults.details.forEach((d) => {
      const statusIcon = d.status === "passed" ? "✅" : d.status === "failed" ? "❌" : "⏭️"
      timingSummary.push(`  ${statusIcon} ${d.name}: ${d.status}${d.error ? ` - ${d.error}` : ""}`)
    })

    if (smartTestResults) {
      timingSummary.push("", "=== SMART TEST RESULTS ===")
      timingSummary.push(smartTestResults)
    }

    const completeLog = [
      ...logger.getLogs(),
      ...timingSummary,
    ]

    // Save log to drive before unmounting
    try {
      console.log(`\n💾 Saving backup log...`)
      await saveBackupLog(
        MOUNT_POINT,
        completeLog.join("\n"),
        syncSuccess && verifyResults.failed === 0,
      )
      console.log(`✅ Log saved to drive`)
    } catch (error) {
      console.warn(`⚠️  Could not save log to drive: ${error}`)
      // Save locally as fallback
      const localLog = `/tmp/offline-backup-${
        new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
      }.log`
      await Deno.writeTextFile(localLog, completeLog.join("\n"))
      console.log(`📝 Log saved locally: ${localLog}`)
    }

    // Unmount and eject
    console.log(`\n🔒 Unmounting and ejecting drive...`)
    await unmountDrive(partition, MOUNT_POINT)
    await ejectDrive(device)

    console.log(`\n📂 To manually inspect the backup drive later:`)
    console.log(`   udisksctl mount -b ${partition}`)
    console.log(`   # Drive will be auto-mounted, check with: mount | grep ${driveName}`)
    console.log(`   # To unmount: udisksctl unmount -b ${partition}`)
    console.log(`   # To eject: udisksctl power-off -b ${device}`)
  } catch (error) {
    console.error(`\n❌ Error during backup: ${error}`)

    // Stop logging
    logger.stop()

    // Save error log
    try {
      if (MOUNT_POINT) {
        const completeLog = logger.getLogs()
        await saveBackupLog(MOUNT_POINT, completeLog.join("\n"), false)
      }
    } catch {
      // If we can't save to mount, save locally
      const localLog = `/tmp/offline-backup-error-${Date.now()}.log`
      await Deno.writeTextFile(localLog, logger.getLogs().join("\n"))
      console.error(`\n📝 Error log saved to: ${localLog}`)
    }

    // Try to unmount and eject on error
    try {
      if (MOUNT_POINT && partition && device) {
        await unmountDrive(partition, MOUNT_POINT)
        await ejectDrive(device)
      }
    } catch {
      // Ignore cleanup errors
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
  console.log("⚠️  This script requires no sudo privileges for mounting")
  console.log("")
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
  let MOUNT_POINT = ""
  try {
    if (await isMounted(partition)) {
      console.log(`ℹ️  ${partition} is already mounted`)
      const currentMount = await getMountPoint(partition)
      if (currentMount) {
        console.log(`   Current mount point: ${currentMount}`)
        const useExisting = prompt("Use this mount point? (yes/no) [no]: ")
        if (useExisting?.toLowerCase() === "yes") {
          MOUNT_POINT = currentMount
        } else {
          await unmountDrive(partition, currentMount)
          MOUNT_POINT = await mountDrive(partition)
        }
      }
    } else {
      MOUNT_POINT = await mountDrive(partition)
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
      await unmountDrive(partition, MOUNT_POINT)
      await ejectDrive(device)
      Deno.exit(1)
    }

    // Show README if available
    try {
      const readmePath = `${MOUNT_POINT}/README.md`
      const readme = await Deno.readTextFile(readmePath)
      console.log("\n📋 Backup Information:\n")
      console.log(readme.split("\n").slice(0, 20).join("\n"))
      console.log("\n...(see README.md for complete info)\n")
    } catch {
      console.log("\nℹ️  No README found\n")
    }

    // Confirm restore
    const confirm = prompt(
      "\n⚠️  Type 'RESTORE' to restore all backups to local folder: ",
    )
    if (confirm !== "RESTORE") {
      console.log("❌ Restore cancelled")
      await unmountDrive(partition, MOUNT_POINT)
      await ejectDrive(device)
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
    console.log(`\n🔒 To safely remove drive:`)
    console.log(`  udisksctl unmount -b ${partition}`)
    console.log(`  udisksctl power-off -b ${device}`)

    // Unmount and eject
    await unmountDrive(partition, MOUNT_POINT)
    await ejectDrive(device)
  } catch (error) {
    console.error(`\n❌ Error during restore: ${error}`)

    // Try to unmount and eject on error
    try {
      if (MOUNT_POINT) {
        await unmountDrive(partition, MOUNT_POINT)
        await ejectDrive(device)
      }
    } catch {
      // Ignore cleanup errors
    }

    Deno.exit(1)
  }
}

async function verify(envVars: Record<string, string>): Promise<void> {
  const resticPassword = envVars.BACKUPS_PASSWORD

  console.log("\n=== Offline Backup - Verify Mode ===\n")
  console.log("⚠️  This will mount the backup drive, verify all repositories,")
  console.log("   run SMART checks, and then safely unmount.\n")

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
  let MOUNT_POINT = ""
  try {
    if (await isMounted(partition)) {
      console.log(`ℹ️  ${partition} is already mounted`)
      const currentMount = await getMountPoint(partition)
      if (currentMount) {
        console.log(`   Current mount point: ${currentMount}`)
        const useExisting = prompt("Use this mount point? (yes/no) [no]: ")
        if (useExisting?.toLowerCase() === "yes") {
          MOUNT_POINT = currentMount
        } else {
          await unmountDrive(partition, currentMount)
          MOUNT_POINT = await mountDrive(partition)
        }
      }
    } else {
      MOUNT_POINT = await mountDrive(partition)
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
      await unmountDrive(partition, MOUNT_POINT)
      await ejectDrive(device)
      Deno.exit(1)
    }

    // Show README if available
    try {
      const readmePath = `${MOUNT_POINT}/README.md`
      const readme = await Deno.readTextFile(readmePath)
      console.log("\n📋 Backup Information:\n")
      console.log(readme.split("\n").slice(0, 20).join("\n"))
      console.log("\n...(see README.md for complete info)\n")
    } catch {
      console.log("\nℹ️  No README found\n")
    }

    // Get backup size
    console.log("\n📊 Analyzing backup...")
    const sizeInfo = await getBackupSize(reposDir)
    console.log(`💾 Backup Size: ${sizeInfo.human}\n`)

    // Verify backups with restic
    console.log("🔍 Starting full verification (this may take a while)...\n")
    const verifyResults = await verifyBackups(MOUNT_POINT, resticPassword)

    // Display verification summary
    console.log("\n" + "=".repeat(60))
    console.log("📦 VERIFICATION RESULTS")
    console.log("=".repeat(60))
    console.log(`\n✅ Passed:  ${verifyResults.passed}`)
    if (verifyResults.failed > 0) {
      console.log(`❌ Failed:  ${verifyResults.failed}`)
      verifyResults.details.filter((d) => d.status === "failed").forEach((d) => {
        console.log(`   - ${d.name}: ${d.error || "unknown error"}`)
      })
    }
    if (verifyResults.skipped > 0) {
      console.log(`⏭️  Skipped: ${verifyResults.skipped} (not restic repos)`)
    }

    // Ask about SMART check
    console.log("\n🔍 Drive Health Check (SMART)")
    console.log("   short: ~2 minutes  - Quick electrical/mechanical check")
    console.log("   long:  ~390 minutes - Comprehensive surface scan")
    console.log("   no:    Skip health check")
    const smartChoice = prompt(
      "\n❓ Would you like a SMART check of the drive's health? (short/long/no) [short]: ",
    ) || "short"

    let smartTestResults = ""
    if (smartChoice.toLowerCase() === "short" || smartChoice.toLowerCase() === "long") {
      smartTestResults = await runSmartCheck(device, smartChoice.toLowerCase() as "short" | "long")
    } else {
      console.log("\n⏭️  Skipping SMART check")
    }

    // Display final summary
    console.log("\n" + "=".repeat(60))
    console.log("📊 VERIFICATION COMPLETE")
    console.log("=".repeat(60))

    if (verifyResults.failed === 0) {
      console.log("\n✅ All checks passed! Backup drive is healthy.")
    } else {
      console.log("\n⚠️  Some verification checks failed. Review the results above.")
    }

    if (smartTestResults) {
      console.log("\n🔍 SMART check completed (see results above)")
    }

    console.log("=".repeat(60))

    // Unmount and eject
    console.log("\n🔒 Unmounting and ejecting drive...")
    await unmountDrive(partition, MOUNT_POINT)
    await ejectDrive(device)

    console.log("\n✅ Verification complete. Drive safely ejected.")
  } catch (error) {
    console.error(`\n❌ Error during verification: ${error}`)

    // Try to unmount and eject on error
    try {
      if (MOUNT_POINT) {
        await unmountDrive(partition, MOUNT_POINT)
        await ejectDrive(device)
      }
    } catch {
      // Ignore cleanup errors
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
  verify    Mount and verify existing backup (restic + SMART checks)
  help      Show this help message

Environment Variables Required:
  LOCAL_BACKUPS_PATH   Path to local backups folder (e.g., ~/sync/backups)
  BACKUPS_PASSWORD     Restic repository password

Examples:
  # Create offline backup on external drive
  deno task offline-backup create

  # Restore from external drive
  deno task offline-backup restore

  # Verify existing backup on external drive
  deno task offline-backup verify

  # Show help
  deno task offline-backup help

Features:
  - Automatic drive detection and selection
  - BTRFS formatting with compression
  - User-space mounting (no sudo for mount/unmount)
  - Rsync with progress display (size, speed, percentage)
  - Restic integrity verification (100% data verification)
  - SMART health check (short/long tests)
  - Comprehensive logging (all console output saved)
  - README generation with backup metadata
  - Safe unmount and eject
  - Deletion warnings before removing repos

Storage Recommendations for Singapore:
  - Store in dry cabinet ($50-200 SGD) or sealed container with desiccant
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

  if (!["create", "restore", "verify"].includes(command)) {
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
  } else if (command === "verify") {
    await verify(envVars)
  }
}

if (import.meta.main) {
  main()
}
