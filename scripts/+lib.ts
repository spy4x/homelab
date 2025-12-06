export function success(...args: unknown[]) {
  console.log(`%c${args.join(" ")}`, "color: green; font-weight: bold")
}

export function error(...args: unknown[]) {
  console.error(`%c${args.join(" ")}`, "color: red; font-weight: bold")
}

export function log(...args: unknown[]) {
  console.log(...args)
}

/**
 * Loads environment variables from a .env file
 * Handles comments, empty lines, and quoted values
 */
export async function loadEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const content = await Deno.readTextFile(path)
    const env: Record<string, string> = {}

    for (const line of content.split("\n")) {
      const trimmedLine = line.trim()

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue
      }

      // Parse key=value pairs
      const equalsIndex = trimmedLine.indexOf("=")
      if (equalsIndex === -1) {
        continue
      }

      const key = trimmedLine.substring(0, equalsIndex).trim()
      let value = trimmedLine.substring(equalsIndex + 1).trim()

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      env[key] = value
    }

    return env
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return {}
    }
    throw err
  }
}
