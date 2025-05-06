import { absPath, BackupConfig, getEnvVar, logError, logInfo, PATH_APPS, USER } from "./+lib.ts"

// #region VARS & TYPES
enum Status {
  IN_PROGRESS = 1,
  SUCCESS = 2,
  ERROR = 3,
}

type BackupConfigState = BackupConfig & {
  fileName: string
  status: Status
  error?: string
  errorAtStep?: string
}

const backups: BackupConfigState[] = []
const backupsOutputBasePath = absPath(getEnvVar("PATH_SYNC") + "/backups")
const backupsPassword = getEnvVar("BACKUPS_PASSWORD")
const webhookUrl = getEnvVar("SLACK_WEBHOOK_URL")
const configsPath = absPath(`${PATH_APPS}/backup/configs`)

// #endregion VARS & TYPES

// #region MAIN CYCLE
logInfo(`[${new Date().toISOString()}] Starting backup process`)
// dynamically import all backup configs from ./configs/*.backup.ts
const configFiles = Deno.readDirSync(configsPath)
for (const file of configFiles) {
  // check if the file is a .backup.ts file
  if (file.isFile && file.name.endsWith(".backup.ts")) {
    // import the file
    const config = await import(`${configsPath}/${file.name}`)

    // check if the file exports a BackupConfig
    if (!config.default) {
      const backup: BackupConfigState = {
        name: file.name,
        sourcePaths: [],
        fileName: file.name,
        status: Status.IN_PROGRESS,
      }
      failed(backup, `File ${file.name} does not export a default BackupConfig`, "config")
      backups.push(backup)
      continue
    }

    const backup: BackupConfigState = {
      ...config.default,
      fileName: file.name,
      status: Status.IN_PROGRESS,
    }
    backups.push(backup)

    logInfo(`--------- ${backup.name} ---------`)

    if (!checkBackupConfig(backup)) {
      continue
    }

    await containers(backup, "stop")
    await changeOwnership(backup)
    await resticBackup(backup)
    await containers(backup, "start")
    if (backup.status === Status.IN_PROGRESS) {
      backup.status = Status.SUCCESS
    }
  }
}
// #endregion MAIN CYCLE

// #region FINALIZE
const failedBackupsAmount = backups.filter((backup) => backup.status === Status.ERROR).length
// check if there are any backup configs
if (backups.length === 0) {
  console.error("No backup configs found")
  await notify()
  Deno.exit(1)
}
await notify()
// if any backup failed, summarize errors and exit with error

logInfo(
  `--------- Backups finished: ${
    backups.length - failedBackupsAmount
  } / ${backups.length} successful ---------`,
)

for (const backup of backups) {
  const isSuccess = backup.status === Status.SUCCESS
  logInfo(
    `${isSuccess ? "✅" : "❌"} ${backup.name}: ${
      isSuccess ? "Success" : backup.errorAtStep?.toUpperCase() || "Error"
    }`,
  )
}
// #endregion FINALIZE

// #region FUNCTIONS
/** Chechs if the backup config is valid */
function checkBackupConfig(config: BackupConfigState): boolean {
  if (!config.name) {
    config.name = config.fileName
    failed(config, "Backup config is missing a name", "config")
    return false
  }

  // normalize source paths
  if (config.sourcePaths === "default") {
    config.sourcePaths = getDefaultSourcePaths(config)
  }

  if (!config.sourcePaths || config.sourcePaths.length === 0) {
    failed(config, "Backup config is missing source paths", "config")
    return false
  }

  // check if the source paths exist
  for (const path of config.sourcePaths) {
    if (!checkPathExists(config, path)) break
  }

  // normalize paths to change ownership
  if (config.pathsToChangeOwnership === "default") {
    config.pathsToChangeOwnership = getDefaultSourcePaths(config)
  }

  // normalize containers
  if (config.containers?.stop === "default") {
    config.containers.stop = [config.name]
  }
  return true
}

function getDefaultSourcePaths(backup: BackupConfigState): string[] {
  return [
    `${PATH_APPS}/.volumes/${backup.name}`,
  ]
}

function checkPathExists(config: BackupConfigState, path: string): boolean {
  const aPath = absPath(path)
  try {
    const stat = Deno.statSync(aPath)
    // check if the stat exists
    if (!stat) {
      failed(config, `Source path ${aPath} does not exist`, "config")
      return false
    }
    return true
  } catch {
    failed(config, `Source path ${aPath} does not exist`, "config")
    return false
  }
}

/** Notifies the user of the backup status */
async function notify() {
  try {
    // send a message to Slack
    const message = {
      text: "Backup finished",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Backup finished: ${
              backups.length - failedBackupsAmount
            } / ${backups.length} successful`,
          },
        },
        ...backups.map((backup) => ({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${backup.status === Status.SUCCESS ? "✅" : "❌"} *${backup.name}*: ${
              backup.error ? `*[${backup.errorAtStep?.toUpperCase()}]*: ${backup.error}` : "Success"
            }`,
          },
        })),
      ],
    }
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      logError(`Error sending Slack message: ${response.statusText}`)
    } else {
      logInfo("Slack message sent")
    }
  } catch (err) {
    logError(`Failed to send Slack notification: ${err}`)
  }
}

/** Starts/Stops the containers */

/** Starts/Stops the containers */
async function containers(
  config: BackupConfigState,
  action: "start" | "stop",
) {
  // Only operate if containers.stop is defined and non-empty
  if (!config.containers?.stop || config.containers.stop.length === 0) {
    return
  }

  for (const containerName of config.containers.stop) {
    logInfo(`${action}ing container ${containerName}`)
    const cmd = new Deno.Command("docker", {
      args: [action, containerName],
      stdout: "piped",
      stderr: "piped",
    })

    const { code, stderr } = await cmd.output()
    if (code !== 0) {
      failed(
        config,
        `Error ${action}ing container ${containerName}:\n${new TextDecoder().decode(stderr)}`,
        `docker_${action}`,
      )
    }
  }
}

/** Helper to run a restic command and handle output/errors */
async function runResticCommand(
  args: string[],
  config: BackupConfigState,
  step: string,
): Promise<boolean> {
  const cmd = new Deno.Command("restic", {
    args,
    stdout: "piped",
    stderr: "piped",
    env: {
      ...Deno.env.toObject(),
      RESTIC_PASSWORD: backupsPassword,
    },
  })
  const { code, stdout, stderr } = await cmd.output()
  const outStr = new TextDecoder().decode(stdout)
  const errStr = new TextDecoder().decode(stderr)

  // Handle exit codes according to official Restic docs
  if (code === 0) {
    config.status = Status.SUCCESS
    logInfo(`Restic ${step} succeeded`)
    return true
  }

  // Special handling for known restic exit codes
  let errorMsg = errStr || outStr || `Restic exited with code ${code}`
  switch (code) {
    case 1:
      errorMsg = errorMsg || "Restic command failed (code 1)"
      break
    case 2:
      errorMsg = "Go runtime error (code 2)"
      break
    case 3:
      errorMsg = "Backup could not read some source data (code 3)"
      break
    case 10:
      errorMsg = "Repository does not exist (code 10)"
      break
    case 11:
      errorMsg = "Failed to lock repository (code 11)"
      break
    case 12:
      errorMsg = "Wrong password for repository (code 12)"
      break
    case 130:
      errorMsg = "Restic was interrupted (code 130)"
      break
    default:
      errorMsg = errorMsg || `Restic failed with exit code ${code}`
  }
  failed(config, errorMsg + " " + errStr, `restic_${step}`)
  return false
}

async function resticBackup(config: BackupConfigState) {
  if (config.status === Status.ERROR) {
    return
  }
  const repoPath = absPath(`${backupsOutputBasePath}/${config.name}`)
  // 1. Check repo (if doesn't exist, log and init)
  let checkOk = await runResticCommand(
    [
      "-r",
      repoPath,
      "cat",
      "config",
    ],
    config,
    "check",
  )
  if (!checkOk) {
    // Only init if the error is about missing repo
    const lastError = config.error || ""
    if (
      lastError.includes("is not a restic repository") ||
      lastError.includes("does not exist") ||
      lastError.includes("no such file or directory")
    ) {
      const missingRepoMsg = `Restic repo does not exist at ${repoPath}, will initialize it.`
      logInfo(missingRepoMsg)
      config.error = missingRepoMsg
      // Try to init
      const initOk = await runResticCommand(
        [
          "init",
          "-r",
          repoPath,
        ],
        config,
        "init",
      )
      if (!initOk) return
      // Try check again
      checkOk = await runResticCommand(
        [
          "-r",
          repoPath,
          "cat",
          "config",
        ],
        config,
        "check",
      )
      if (!checkOk) return
    } else {
      // Not a missing repo error, abort
      return
    }
  }

  // verify integrity
  const checkIntegrityBeforeOk = await runResticCommand(
    [
      "check",
      "-r",
      repoPath,
    ],
    config,
    "check_integrity_before",
  )
  if (!checkIntegrityBeforeOk) return

  // 2. Backup
  const backupOk = await runResticCommand(
    [
      "backup",
      ...((config.sourcePaths as string[]).map((path) => absPath(path))),
      "-r",
      repoPath,
    ],
    config,
    "backup",
  )
  if (!backupOk) return

  // 4. Forget
  const forgetOk = await runResticCommand(
    [
      "forget",
      "--prune",
      "--keep-last",
      "7",
      "--keep-weekly",
      "4",
      "--keep-monthly",
      "3",
      "-r",
      repoPath,
    ],
    config,
    "forget",
  )
  if (!forgetOk) return

  // verify integrity
  const checkIntegrityAfterOk = await runResticCommand(
    [
      "check",
      "-r",
      repoPath,
    ],
    config,
    "check_integrity_after",
  )
  if (!checkIntegrityAfterOk) return
}

async function changeOwnership(config: BackupConfigState) {
  if (!config.pathsToChangeOwnership || config.pathsToChangeOwnership.length === 0) {
    return
  }

  for (const path of config.pathsToChangeOwnership) {
    const aPath = absPath(path)
    logInfo(`Changing ownership of ${aPath} to ${USER}:${USER}`)
    const cmd = new Deno.Command("sudo", {
      args: ["chown", "-R", `${USER}:${USER}`, aPath],
      stdout: "piped",
      stderr: "piped",
    })

    const { code, stderr } = await cmd.output()
    if (code !== 0) {
      failed(
        config,
        `Error changing ownership of ${path}:\n${new TextDecoder().decode(stderr)}`,
        "chown",
      )
    }
  }
  logInfo("Ownership changed successfully")
}

function failed(backup: BackupConfigState, error: string, step: string) {
  backup.status = Status.ERROR
  backup.error = error
  backup.errorAtStep = step
  logError(`[${step.toUpperCase()}] ${backup.error}`)
}

// #endregion FUNCTIONS
