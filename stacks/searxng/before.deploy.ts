const settingsTemplate = Deno.readTextFileSync(
  new URL("./searxng-settings.yml", import.meta.url).pathname,
)

const filled = settingsTemplate.replace(
  /\$\{SEARXNG_SECRET_KEY\}/g,
  Deno.env.get("SEARXNG_SECRET_KEY") || "",
)

const outputPath = new URL("./settings.yml", import.meta.url).pathname
Deno.writeTextFileSync(outputPath, filled)
console.log("settings.yml generated in stack dir")
