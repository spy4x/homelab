// SSH helper to connect to servers
// Usage: deno task ssh <server>
// Example: deno task ssh home

import { error, log } from "../+lib.ts"

const validServers = ["home", "cloud", "offsite"]

const args = Deno.args
if (args.length === 0) {
  error("Usage: deno task ssh <server>")
  log(`Available servers: ${validServers.join(", ")}`)
  Deno.exit(1)
}

const server = args[0]

if (!validServers.includes(server)) {
  error(`Invalid server: ${server}`)
  log(`Available servers: ${validServers.join(", ")}`)
  Deno.exit(1)
}

// Load server config to get SSH address
const serverEnvPath = `./servers/${server}/.env`
let sshAddress = ""

try {
  const envContent = await Deno.readTextFile(serverEnvPath)
  const lines = envContent.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("SSH_ADDRESS=")) {
      sshAddress = trimmed.split("=")[1].replace(/["']/g, "")
      break
    }
  }

  if (!sshAddress) {
    error(`SSH_ADDRESS not found in ${serverEnvPath}`)
    Deno.exit(1)
  }

  log(`Connecting to ${server} (${sshAddress})...`)

  const cmd = new Deno.Command("ssh", {
    args: [sshAddress],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const status = await cmd.output()
  Deno.exit(status.code)
} catch (err) {
  error(`Failed to read ${serverEnvPath}: ${err}`)
  Deno.exit(1)
}
