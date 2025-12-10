import { absPath, logError, VOLUMES_PATH } from "./+lib.ts"
import { BackupConfigState, BackupStatus } from "./types.ts"

export class BackupConfigProcessor {
  /**
   * Validates and normalizes a backup configuration
   */
  static validateAndNormalize(config: BackupConfigState): boolean {
    if (!config.name) {
      config.name = config.fileName
      this.markConfigFailed(config, "Backup config is missing a name")
      return false
    }

    // Normalize source paths
    if (config.sourcePaths === "default") {
      config.sourcePaths = this.getDefaultSourcePaths(config)
    }

    if (!config.sourcePaths || config.sourcePaths.length === 0) {
      this.markConfigFailed(config, "Backup config is missing source paths")
      return false
    }

    // Validate source paths exist
    for (const path of config.sourcePaths) {
      if (!this.checkPathExists(config, path)) {
        return false
      }
    }

    // Normalize ownership paths
    if (config.pathsToChangeOwnership === "default") {
      config.pathsToChangeOwnership = this.getDefaultSourcePaths(config)
    }

    // Normalize containers
    if (config.containers?.stop === "default") {
      config.containers.stop = [config.name]
    }

    return true
  }

  /**
   * Gets default source paths for a backup configuration
   */
  private static getDefaultSourcePaths(backup: BackupConfigState): string[] {
    return [`${VOLUMES_PATH}/${backup.name}`]
  }

  /**
   * Checks if a path exists and is accessible
   */
  private static checkPathExists(config: BackupConfigState, path: string): boolean {
    const absolutePath = absPath(path)
    try {
      const stat = Deno.statSync(absolutePath)
      if (!stat) {
        this.markConfigFailed(config, `Source path ${absolutePath} does not exist`)
        return false
      }
      return true
    } catch {
      this.markConfigFailed(config, `Source path ${absolutePath} does not exist`)
      return false
    }
  }

  /**
   * Marks a configuration as failed with an error message
   */
  private static markConfigFailed(config: BackupConfigState, error: string): void {
    config.status = BackupStatus.ERROR
    config.error = error
    config.errorAtStep = "config"
    logError(`[CONFIG] ${error}`)
  }

  /**
   * Loads all backup configurations from the configs directory
   */
  static async loadConfigurations(configsPath: string): Promise<BackupConfigState[]> {
    const backups: BackupConfigState[] = []
    const configFiles = Deno.readDirSync(configsPath)

    for (const file of configFiles) {
      if (!file.isFile || !file.name.endsWith(".backup.ts")) {
        continue
      }

      try {
        const configModule = await import(`${configsPath}/${file.name}`)

        if (!configModule.default) {
          const backup: BackupConfigState = {
            name: file.name,
            sourcePaths: [],
            fileName: file.name,
            status: BackupStatus.ERROR,
            error: `File ${file.name} does not export a default BackupConfig`,
            errorAtStep: "config",
          }
          backups.push(backup)
          continue
        }

        const backup: BackupConfigState = {
          ...configModule.default,
          fileName: file.name,
          status: BackupStatus.IN_PROGRESS,
        }

        backups.push(backup)
      } catch (error) {
        const backup: BackupConfigState = {
          name: file.name,
          sourcePaths: [],
          fileName: file.name,
          status: BackupStatus.ERROR,
          error: `Failed to load config: ${error}`,
          errorAtStep: "config",
        }
        backups.push(backup)
      }
    }

    return backups
  }
}
