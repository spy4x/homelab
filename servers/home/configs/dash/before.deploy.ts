const templateFile = new URL("index.html.template", import.meta.url).pathname
const outputFile = new URL("index.html", import.meta.url).pathname

/**
 * Replaces all occurrences of ${ENV_VAR_NAME} in a template string
 * with the corresponding value from Deno.env.
 * @param template The template string content.
 * @returns The substituted string content.
 */
function substituteEnvVars(template: string): string {
  // Regex: Finds ${...} groups globally. The content inside the group (...)
  // is captured as $1 (the environment variable name).
  return template.replace(/\${([^}]+)}/g, (_match, envVarName) => {
    const value = Deno.env.get(envVarName.trim())

    if (value === undefined) {
      throw new Error(`Environment variable '${envVarName.trim()}' not found.`)
    }

    return value
  })
}

// --- Main execution ---
try {
  // 1. Read the template file content
  const templateContent = await Deno.readTextFile(templateFile)

  // 2. Perform the environment variable substitution
  const outputContent = substituteEnvVars(templateContent)

  // 3. Write the new file
  await Deno.writeTextFile(outputFile, outputContent)

  console.log(`Successfully generated '${outputFile}' from '${templateFile}'.`)
} catch (error: unknown) {
  console.error(`An error occurred: ${error instanceof Error ? error.message : String(error)}`)
  Deno.exit(1)
}
