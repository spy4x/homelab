// Ansible wrapper script that loads environment variables and runs ansible-playbook
// Usage: deno run -A scripts/ansible/+main.ts <playbook> <target>
// Example: deno run -A scripts/ansible/+main.ts ansible/playbooks/maintenance.yml offsite

import { error, log, success } from "../+lib.ts"

// Parse command line arguments
const args = Deno.args
if (args.length < 2) {
  error("Usage: deno run -A scripts/ansible/+main.ts <playbook> <target>")
  error("Example: deno run -A scripts/ansible/+main.ts ansible/playbooks/maintenance.yml offsite")
  Deno.exit(1)
}

const [playbookPath, target] = args

// Validate target
const validTargets = ["home", "offsite", "cloud"]
if (!validTargets.includes(target)) {
  error(`Invalid target: ${target}. Must be one of: ${validTargets.join(", ")}`)
  Deno.exit(1)
}

// Load environment variables from root .env
const rootEnvPath = "./.env"
const rootEnv = await loadEnvFile(rootEnvPath)

// Load environment variables from ansible/.env
const ansibleEnvPath = "./ansible/.env"
const ansibleEnv = await loadEnvFile(ansibleEnvPath)

// Load environment variables from target's server folder .env
const targetEnvPath = `./servers/${target}/.env`
const targetEnv = await loadEnvFile(targetEnvPath)

// Merge all environment variables (later ones override earlier ones)
const mergedEnv = { ...Deno.env.toObject(), ...rootEnv, ...ansibleEnv, ...targetEnv }

log(`Running ansible-playbook ${playbookPath} for target: ${target}`)

// Run ansible-playbook with merged environment variables
const command = new Deno.Command("ansible-playbook", {
  args: [
    playbookPath,
    "-i",
    "ansible/inventory.yml",
    "--limit",
    target,
  ],
  env: mergedEnv,
  stdout: "inherit",
  stderr: "inherit",
})

const { code } = await command.output()

if (code !== 0) {
  error(`ansible-playbook failed with exit code ${code}`)
  Deno.exit(code)
}

success("Ansible playbook completed successfully")

// Helper function to load and parse .env file
async function loadEnvFile(path: string): Promise<Record<string, string>> {
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
      log(`Warning: ${path} not found, skipping`)
      return {}
    }
    throw err
  }
}
