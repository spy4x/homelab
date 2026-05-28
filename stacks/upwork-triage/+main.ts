import { Hono } from "jsr:@hono/hono@^4"
import type { Context } from "jsr:@hono/hono@^4"
import { DeepSeekEvaluator } from "./evaluator.ts"
import { TelegramNotifier } from "./notifier.ts"
import type { JobRecord, VollnaPayload, VollnaWebhookPayload } from "./types.ts"

const authToken = Deno.env.get("UPWORK_TRIAGE_WEBHOOK_AUTH_TOKEN")
if (!authToken) {
  throw new Error("UPWORK_TRIAGE_WEBHOOK_AUTH_TOKEN is required")
}

const dataPath = Deno.env.get("UPWORK_TRIAGE_DATA_PATH") || "/app/data"
const dataFile = `${dataPath}/jobs.json`

const batchDelayMs = parseInt(
  Deno.env.get("UPWORK_TRIAGE_BATCH_DELAY_MS") || "500",
  10,
)

const evaluator = new DeepSeekEvaluator()
const notifier = new TelegramNotifier()

const app = new Hono()

// ── Helpers ──

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function normalizeSkills(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === "string")
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean)
  return null
}

async function readJobs(): Promise<JobRecord[]> {
  try {
    const raw = await Deno.readTextFile(dataFile)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : parsed.jobs ?? []
  } catch {
    return []
  }
}

async function appendJob(record: JobRecord): Promise<void> {
  await Deno.mkdir(dataPath, { recursive: true })
  const jobs = await readJobs()
  jobs.push(record)
  await Deno.writeTextFile(dataFile, JSON.stringify({ jobs }, null, 2))
}

// ── Request log ──

app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(
    JSON.stringify({
      event: "request",
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
    }),
  )
})

// ── Health ──

app.get("/health", async (c) => {
  const deepseekOk = await evaluator.ping().catch(() => false)
  const dataOk = await Deno.stat(dataPath).then(() => true).catch(() => false)
  const status = deepseekOk ? "ok" : "degraded"
  return c.json({ status, deepseekOk, dataOk }, deepseekOk ? 202 : 503)
})

// ── Auth middleware ──

function isAuthorized(c: Context): boolean {
  if (c.req.query("token") === authToken) return true
  const h = c.req.header("Authorization")
  if (h?.startsWith("Bearer ") && h.slice(7) === authToken) return true
  return false
}

app.use("/v1/*", async (c, next) => {
  if (!isAuthorized(c)) return c.json({ error: "Unauthorized" }, 401)
  await next()
})

// ── Webhook ──

app.post("/v1/vollna-webhook", async (c) => {
  let rawBody: string
  try {
    rawBody = await c.req.text()
  } catch {
    return c.json({ error: "Cannot read body" }, 400)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    console.error(
      JSON.stringify({ event: "webhook.bad_json", bodyPreview: rawBody.substring(0, 2000) }),
    )
    return c.json({ error: "Invalid JSON payload" }, 400)
  }

  if (Array.isArray(parsed.projects)) {
    return await handleBatch(c, parsed as unknown as VollnaWebhookPayload)
  }
  return await handleSingle(c, parsed)
})

function extractJob(p: Record<string, unknown>): { title: string; url: string } {
  return {
    title: String(p.title ?? p.job_title ?? p.name ?? ""),
    url: String(p.url ?? p.job_url ?? p.link ?? p.application_link ?? ""),
  }
}

async function handleSingle(c: Context, parsed: Record<string, unknown>) {
  const { title, url } = extractJob(parsed)
  if (!title || !url) {
    console.error(JSON.stringify({ event: "webhook.missing_fields", keys: Object.keys(parsed) }))
    return c.json({ error: "Missing required fields: title, url" }, 400)
  }
  const payload: VollnaPayload = { ...parsed, title, url } as VollnaPayload
  processAndStore(payload, undefined)
  return c.json({ status: "accepted" }, 200)
}

async function handleBatch(c: Context, data: VollnaWebhookPayload) {
  const filterName = data.filter.name
  console.log(
    JSON.stringify({ event: "webhook.batch_received", filterName, count: data.projects.length }),
  )

  for (let i = 0; i < data.projects.length; i++) {
    const p = data.projects[i]
    console.log(
      JSON.stringify({
        event: "webhook.project_evaluating",
        index: i + 1,
        of: data.projects.length,
        title: p.title,
      }),
    )
    const payload: VollnaPayload = {
      title: p.title,
      description: p.description,
      url: p.url,
      skills: normalizeSkills(p.skills) ?? undefined,
      budget: (p.budget as string | undefined) ?? undefined,
    }
    processAndStore(payload, filterName)
    if (i < data.projects.length - 1) {
      await new Promise((r) => setTimeout(r, batchDelayMs))
    }
  }

  return c.json({ status: "accepted", total: data.projects.length }, 200)
}

function processAndStore(payload: VollnaPayload, filterName: string | undefined): void {
  evaluator.evaluate(payload).then(async (result) => {
    const notified = result.verdict === "Yes"
    const record: JobRecord = {
      id: uid(),
      title: payload.title,
      url: payload.url,
      description: payload.description,
      budget: payload.budget ?? null,
      skills: normalizeSkills(payload.skills),
      filterName,
      verdict: result.verdict,
      reason: result.reason,
      applicationHook: result.applicationHook,
      notified,
      processedAt: new Date().toISOString(),
    }

    await appendJob(record)

    console.log(JSON.stringify({
      event: "webhook.conclusion",
      id: record.id,
      title: record.title,
      verdict: record.verdict,
      notified,
      reason: result.reason,
    }))

    if (notified) {
      await notifier.notify(payload, result)
      console.log(
        JSON.stringify({ event: "webhook.notified", channels: ["telegram"], title: record.title }),
      )
    } else {
      console.log(
        JSON.stringify({ event: "webhook.filtered", title: record.title, reason: result.reason }),
      )
    }
  }).catch((err) => {
    console.error(
      JSON.stringify({ event: "webhook.error", title: payload.title, error: String(err) }),
    )
  })
}

// ── API ──

app.get("/api/jobs", async (c) => {
  const jobs = await readJobs()
  const page = parseInt(c.req.query("page") || "1", 10)
  const limit = parseInt(c.req.query("limit") || "50", 10)
  const start = (page - 1) * limit
  const paged = jobs.slice(start, start + limit)
  return c.json({
    total: jobs.length,
    page,
    limit,
    jobs: paged.reverse(), // newest first
  })
})

// ── WebUI static files (Deno-built, served from webui/dist/) ──

const WEBUI_ROOT = `${Deno.cwd()}/webui`
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
}

app.get("*", async (c) => {
  const path = c.req.path === "/" ? "/index.html" : c.req.path
  const full = `${WEBUI_ROOT}${path}`
  try {
    const ext = full.substring(full.lastIndexOf("."))
    const body = await Deno.readFile(full)
    return new Response(body, {
      headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
    })
  } catch {
    return c.text("Not found", 404)
  }
})

// ── Start ──

const port = parseInt(Deno.env.get("PORT") || "8000", 10)
console.log(JSON.stringify({ event: "server.starting", port, dataPath }))
Deno.serve({ port }, app.fetch)
