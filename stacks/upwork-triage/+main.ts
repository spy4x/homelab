import { Hono } from "jsr:@hono/hono@^4"
import type { Context } from "jsr:@hono/hono@^4"
import { DeepSeekEvaluator } from "./evaluator.ts"
import { TelegramNotifier } from "./notifier.ts"
import type { VollnaPayload, VollnaWebhookPayload } from "./types.ts"

const authToken = Deno.env.get("UPWORK_TRIAGE_WEBHOOK_AUTH_TOKEN")
if (!authToken) {
  throw new Error("UPWORK_TRIAGE_WEBHOOK_AUTH_TOKEN is required")
}

const evaluator = new DeepSeekEvaluator()
const notifier = new TelegramNotifier()

const app = new Hono()

// ── Request log (every request, for Grafana/Loki) ──

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

app.get("/health", (c) => {
  return c.json({ status: "ok" }, 202)
})

// ── Auth middleware (query param OR Bearer header) ──

function isAuthorized(c: Context): boolean {
  const queryToken = c.req.query("token")
  if (queryToken === authToken) return true

  const authHeader = c.req.header("Authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7)
    if (bearerToken === authToken) return true
  }

  return false
}

app.use("/v1/*", async (c, next) => {
  if (!isAuthorized(c)) {
    return c.json({ error: "Unauthorized" }, 401)
  }
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
      JSON.stringify({
        event: "webhook.bad_json",
        bodyPreview: rawBody.substring(0, 2000),
      }),
    )
    return c.json({ error: "Invalid JSON payload" }, 400)
  }

  // Detect format: Vollna batch or single job
  const isBatch = Array.isArray(parsed.projects)
  if (isBatch) {
    return await handleBatch(c, parsed as unknown as VollnaWebhookPayload)
  }
  return await handleSingle(c, parsed)
})

// ── Single job format (legacy / manual test) ──

async function handleSingle(c: Context, parsed: Record<string, unknown>) {
  const title = String(
    parsed.title ?? parsed.job_title ?? parsed.name ?? "",
  )
  const url = String(
    parsed.url ?? parsed.job_url ?? parsed.link ?? parsed.application_link ?? "",
  )

  if (!title || !url) {
    console.error(
      JSON.stringify({
        event: "webhook.missing_fields",
        keys: Object.keys(parsed),
        bodyPreview: JSON.stringify(parsed).substring(0, 1000),
      }),
    )
    return c.json(
      {
        error: "Missing required fields. Need title/job_title/name and url/job_url/link",
      },
      400,
    )
  }

  const payload: VollnaPayload = { ...parsed, title, url } as VollnaPayload

  console.log(
    JSON.stringify({
      event: "webhook.received",
      title: payload.title,
      jobUrl: payload.url,
      budget: payload.budget ?? null,
      skills: payload.skills ?? null,
    }),
  )

  processJob(payload)

  return c.json({ status: "accepted" }, 200)
}

// ── Vollna batch format (multiple projects) ──

async function handleBatch(
  c: Context,
  data: VollnaWebhookPayload,
) {
  const count = data.projects.length
  console.log(
    JSON.stringify({
      event: "webhook.batch_received",
      filterName: data.filter.name,
      count,
      resultsUrl: data.results_url,
    }),
  )

  // Process each project sequentially to avoid DeepSeek rate limits
  for (let i = 0; i < count; i++) {
    const project = data.projects[i]
    const payload: VollnaPayload = {
      title: project.title,
      description: project.description,
      url: project.url,
      skills: (project.skills as string[] | undefined) ?? undefined,
      budget: (project.budget as string | undefined) ?? undefined,
    }

    console.log(
      JSON.stringify({
        event: "webhook.project_evaluating",
        index: i + 1,
        of: count,
        title: payload.title,
      }),
    )

    // Don't await — process in background
    processJob(payload)
  }

  return c.json({ status: "accepted", total: count }, 200)
}

// ── Job processing (evaluate + notify if match) ──

function processJob(payload: VollnaPayload): void {
  evaluator.evaluate(payload).then((result) => {
    const notified = result.verdict === "Yes"

    console.log(
      JSON.stringify({
        event: "webhook.conclusion",
        title: payload.title,
        verdict: result.verdict,
        notified,
        reason: result.reason,
        applicationHook: result.applicationHook ? result.applicationHook.substring(0, 200) : null,
      }),
    )

    if (notified) {
      return notifier.notify(payload, result).then(() => {
        console.log(
          JSON.stringify({
            event: "webhook.notified",
            channels: ["telegram"],
            title: payload.title,
          }),
        )
      })
    }

    console.log(
      JSON.stringify({
        event: "webhook.filtered",
        title: payload.title,
        reason: result.reason,
      }),
    )
  }).catch((err) => {
    console.error(
      JSON.stringify({
        event: "webhook.error",
        title: payload.title,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  })
}

// ── Start ──

const port = parseInt(Deno.env.get("PORT") || "8000", 10)

console.log(
  JSON.stringify({
    event: "server.starting",
    port,
  }),
)

Deno.serve({ port }, app.fetch)
