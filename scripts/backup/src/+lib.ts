export const USER = getEnvVar("USER")
export const PATH_APPS = getEnvVar("PATH_APPS")
export const VOLUMES_PATH = getEnvVar("VOLUMES_PATH")
export const PATH_MEDIA = getEnvVar("PATH_MEDIA", true) // Optional - only on home server
export const PATH_SYNC = getEnvVar("PATH_SYNC")
export const SERVER_NAME = getEnvVar("SERVER_NAME")

export interface BackupConfig {
  name: string
  destName?: string // Optional: override destination folder/repo name (e.g., "gatus-home" for shared services)
  sourcePaths: "default" | string[]
  pathsToChangeOwnership?: "default" | string[]
  containers?: {
    stop: "default" | string[]
  }
}

export function logInfo(msg: string) {
  console.log(`[INFO] ${msg}`)
}
export function logError(msg: string) {
  console.error(`[ERROR] ${msg}`)
}

export function getEnvVar(key: string, isOptional = false): string {
  const value = Deno.env.get(key)
  if (!value && !isOptional) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value || ""
}

export function absPath(path: string): string {
  if (path.startsWith("~/")) {
    return path.replace("~", `/home/${USER}`)
  }
  return path
}
