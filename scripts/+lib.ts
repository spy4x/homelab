export function success(...args: unknown[]) {
  console.log(`%c${new Date().toISOString()} ${args.join(" ")}`, "color: green; font-weight: bold")
}

export function error(...args: unknown[]) {
  console.error(`%c${new Date().toISOString()} ${args.join(" ")}`, "color: red; font-weight: bold")
}

export function log(...args: unknown[]) {
  console.log(`${new Date().toISOString()}`, ...args)
}

export function absPath(path: string, user: string): string {
  if (path.startsWith("~/")) {
    return path.replace("~", `/home/${user}`)
  }
  return path
}

/**
 * Execute a shell command with optional sudo and return result
 */
export async function runCommand(
  cmd: string[],
  options?: { sudo?: boolean; cwd?: string },
): Promise<{ success: boolean; output: string; error: string }> {
  const command = options?.sudo ? ["sudo", ...cmd] : cmd
  const proc = new Deno.Command(command[0], {
    args: command.slice(1),
    stdout: "piped",
    stderr: "piped",
    cwd: options?.cwd,
  })

  const output = await proc.output()
  return {
    success: output.code === 0,
    output: new TextDecoder().decode(output.stdout),
    error: new TextDecoder().decode(output.stderr),
  }
}
