import type { BackupConfig } from "./+lib.ts"

export enum BackupStatus {
  IN_PROGRESS = 1,
  SUCCESS = 2,
  ERROR = 3,
}

export type BackupConfigState = BackupConfig & {
  fileName: string
  status: BackupStatus
  error?: string
  errorAtStep?: string
  sizeGB?: number
  sizeError?: string
  durationMs?: number
}

export interface BackupContext {
  serverName: string
  backupsOutputBasePath: string
  backupsPassword: string
  ntfyUrl: string
  ntfyAuth: string
  stacksPath: string
  configsPath: string
  healthchecksUrl?: string // Optional healthchecks.io-style ping URL
}

export interface BackupResult {
  backups: BackupConfigState[]
  successCount: number
  totalCount: number
  totalSizeGB: number
  durationMs: number
}

export interface ResticCommandOptions {
  args: string[]
  config: BackupConfigState
  step: string
  workingDir?: string
}

/**
 * Detects the "container disappeared while we were looking" error that
 * `docker compose start` returns when Watchtower (or any other process
 * with docker.sock access) removed/recreated a service container
 * during the backup window. The phrase "no container to start" is
 * stable across Docker Compose v2.x versions; match on that substring.
 */
export function isMissingContainerError(stderr: string): boolean {
  return stderr.includes("no container to start")
}
