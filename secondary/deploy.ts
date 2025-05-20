const SSH_TO_SERVER = "user@your-server.com" // Replace with your server's SSH address
const REMOTE_PATH = "/path/to/deployment" // Replace with the target path on the server
const FILES_TO_COPY = [".env", "docker-compose.yml"] // Files to copy

async function deploy() {
  try {
    console.log("Starting deployment...")

    // Ensure rsync is available
    const rsyncCheck = Deno.run({
      cmd: ["which", "rsync"],
      stdout: "null",
      stderr: "null",
    })
    const rsyncStatus = await rsyncCheck.status()
    rsyncCheck.close()

    if (!rsyncStatus.success) {
      throw new Error("rsync is not installed. Please install it and try again.")
    }

    // Rsync files to the server
    for (const file of FILES_TO_COPY) {
      console.log(`Copying ${file} to ${SSH_TO_SERVER}:${REMOTE_PATH}`)
      const rsync = Deno.run({
        cmd: ["rsync", "-avz", file, `${SSH_TO_SERVER}:${REMOTE_PATH}`],
      })
      const status = await rsync.status()
      rsync.close()

      if (!status.success) {
        throw new Error(`Failed to copy ${file} to the server.`)
      }
    }

    console.log("Deployment completed successfully.")
  } catch (error) {
    console.error("Deployment failed:", error.message)
    Deno.exit(1)
  }
}

deploy()
