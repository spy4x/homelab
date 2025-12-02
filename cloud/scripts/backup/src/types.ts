import { BackupConfig } from "./+lib.ts"

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
  backupsOutputBasePath: string
  backupsPassword: string
  slackWebhookUrl?: string
  ntfyUrl?: string
  ntfyAuth?: string
  configsPath: string
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
