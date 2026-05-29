// Mail AI Filter
// Polls IMAP inbox, classifies emails with DeepSeek, tags them in-place
// (AI-Urgent / AI-Normal / AI-Noise IMAP keywords so they stay in Inbox),
// sends instant ntfy push for urgent mail.

import { ImapFlow } from "npm:imapflow@1"
import { simpleParser } from "npm:mailparser@3"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Config {
  imapHost: string
  imapPort: number
  imapUser: string
  imapPassword: string
  deepseekApiKey: string
  ntfyUrl: string // full URL incl. topic
  ntfyToken: string
  dataPath: string
  pollIntervalMs: number
}

type Category = "urgent" | "normal" | "noise"

interface Classification {
  category: Category
  urgency_reason?: string
  summary: string
  is_transaction: boolean
  transaction_amount?: number | null
  transaction_currency?: string | null
}

interface ProcessedEntry {
  uid: number
  processedAt: string
}

interface State {
  processed: ProcessedEntry[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG: Record<Category, string> = {
  urgent: "AI-Urgent",
  normal: "AI-Normal",
  noise: "AI-Noise",
}
const TAG_PROCESSED = "AI-Processed"
const PROCESSED_TTL_DAYS = 90
const DEEPSEEK_MAX_BODY = 3000

const SYSTEM_PROMPT = `You are a personal email triage assistant for Anton — a software developer \
and indie entrepreneur who lives in Southeast Asia and runs several SaaS products.

TASK: classify each email into exactly one category and extract structured data.

━━━ CATEGORY RULES ━━━

urgent  →  Anton must act NOW
  • Security: new login, password/2FA change, breach notification
  • Large payment: > $500 USD equivalent (or > 10 000 000 VND)
  • Legal: contract, invoice requiring signature, tax deadline
  • Message from a real human that needs a reply within the day
  • Production/infrastructure incident, critical client escalation

normal  →  Worth reading today, no fire
  • Mid transaction: $50–$500 USD (or 1 000 000–10 000 000 VND)
  • Invoice or receipt that should be tracked
  • Reply from a real person (even if low-urgency)
  • Actionable service notification (not purely automated)
  • Business or collaboration opportunity worth considering

noise   →  Background; skim later
  • Newsletter, marketing, promotional, cold outreach
  • Small transaction: < $50 USD (or < 1 000 000 VND)
  • Fully automated notification (uptime, deploy, backup, shipping)
  • Social / forum / app receipt / loyalty points

━━━ TRANSACTION EXTRACTION ━━━
For ANY financial email (regardless of category):
  • transaction_amount: exact number, digits only (e.g. 125000 not "125,000 VND")
  • transaction_currency: ISO 4217 code (VND, USD, EUR, SGD, …)

━━━ SUMMARY STYLE ━━━
Write 1–2 sentences that tell Anton what happened and whether he needs to do anything.
Be direct. Skip filler phrases like "This email is about…"

━━━ OUTPUT ━━━
Return ONLY valid JSON — no markdown fences, no extra keys:
{
  "category": "urgent" | "normal" | "noise",
  "urgency_reason": "one sentence, only when urgent",
  "summary": "1-2 sentences",
  "is_transaction": true | false,
  "transaction_amount": 123.45 | null,
  "transaction_currency": "VND" | null
}`

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  const require = (key: string): string => {
    const v = Deno.env.get(key)
    if (!v) throw new Error(`Missing required env var: ${key}`)
    return v
  }
  const optional = (key: string, fallback: string): string => Deno.env.get(key) || fallback

  return {
    imapHost: require("MAIL_AI_IMAP_HOST"),
    imapPort: parseInt(optional("MAIL_AI_IMAP_PORT", "993")),
    imapUser: require("MAIL_AI_IMAP_USER"),
    imapPassword: require("MAIL_AI_IMAP_PASSWORD"),
    deepseekApiKey: require("MAIL_AI_DEEPSEEK_API_KEY"),
    ntfyUrl: require("MAIL_AI_NTFY_URL"),
    ntfyToken: require("MAIL_AI_NTFY_TOKEN"),
    dataPath: optional("MAIL_AI_DATA_PATH", "/app/data"),
    pollIntervalMs: parseInt(optional("MAIL_AI_POLL_INTERVAL_MS", "300000")),
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`)
}

function logError(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? "")
  console.error(`${new Date().toISOString()} ERROR ${msg}${detail ? ` — ${detail}` : ""}`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── State ────────────────────────────────────────────────────────────────────

const stateFile = (dataPath: string) => `${dataPath}/state.json`

async function loadState(dataPath: string): Promise<State> {
  try {
    const raw = await Deno.readTextFile(stateFile(dataPath))
    const parsed = JSON.parse(raw) as Partial<State>
    return { processed: parsed.processed ?? [] }
  } catch {
    return { processed: [] }
  }
}

async function saveState(state: State, dataPath: string): Promise<void> {
  await Deno.mkdir(dataPath, { recursive: true })
  await Deno.writeTextFile(stateFile(dataPath), JSON.stringify(state, null, 2))
}

function pruneProcessed(state: State): void {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PROCESSED_TTL_DAYS)
  state.processed = state.processed.filter((e) => new Date(e.processedAt) > cutoff)
}

// ─── Body Extraction ──────────────────────────────────────────────────────────

function extractBody(text: string | undefined, html: string | false | undefined): string {
  if (text) return text.replace(/\s+/g, " ").trim()
  if (html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
  }
  return ""
}

// ─── DeepSeek Classifier ──────────────────────────────────────────────────────

function isValidClassification(obj: unknown): obj is Classification {
  if (!obj || typeof obj !== "object") return false
  const c = obj as Record<string, unknown>
  return (
    (["urgent", "normal", "noise"] as unknown[]).includes(c.category) &&
    typeof c.summary === "string" &&
    c.summary.length > 0 &&
    typeof c.is_transaction === "boolean"
  )
}

async function classify(
  from: string,
  subject: string,
  body: string,
  config: Config,
): Promise<Classification> {
  const userContent = [
    `From: ${from}`,
    `Subject: ${subject}`,
    `---`,
    body.slice(0, DEEPSEEK_MAX_BODY),
  ].join("\n")

  const MAX_ATTEMPTS = 3
  let lastErr: Error = new Error("no attempts")

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(1000 * 2 ** (attempt - 1))
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 350,
        }),
      })

      if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`)

      const data = await res.json() as { choices: Array<{ message: { content: string } }> }
      const parsed: unknown = JSON.parse(data.choices[0].message.content)
      if (!isValidClassification(parsed)) {
        throw new Error(`invalid schema: ${JSON.stringify(parsed)}`)
      }
      return parsed
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      logError(`classify attempt ${attempt}/${MAX_ATTEMPTS}`, lastErr)
    }
  }
  throw lastErr
}

// ─── NTFY Alert ───────────────────────────────────────────────────────────────

async function sendNtfyAlert(
  from: string,
  subject: string,
  classification: Classification,
  config: Config,
): Promise<void> {
  const body = [
    `From: ${from}`,
    classification.urgency_reason ? `Why: ${classification.urgency_reason}` : "",
    "",
    classification.summary,
  ]
    .filter(Boolean)
    .join("\n")

  const res = await fetch(config.ntfyUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.ntfyToken}`,
      "Title": `URGENT: ${subject}`,
      "Priority": "urgent",
      "Tags": "rotating_light,email",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body,
  })

  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`)
  log(`  ntfy sent: "${subject}"`)
}

// ─── IMAP Processing ──────────────────────────────────────────────────────────

interface RawMessage {
  uid: number
  from: string
  subject: string
  date: Date
  body: string
}

async function processEmails(config: Config, state: State): Promise<void> {
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.imapUser, pass: config.imapPassword },
    logger: false,
    tls: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    log("IMAP connected")

    const lock = await client.getMailboxLock("INBOX")
    try {
      const searchResult = await client.search({ seen: false }, { uid: true })
      const allUnseen = Array.isArray(searchResult) ? searchResult : []
      const processedSet = new Set(state.processed.map((e) => e.uid))
      const toProcess = allUnseen.filter((uid) => !processedSet.has(uid))

      if (!toProcess.length) {
        log(`No new emails (${allUnseen.length} unseen, all processed)`)
        return
      }
      log(`Processing ${toProcess.length} new email(s) of ${allUnseen.length} unseen`)

      const rawMessages: RawMessage[] = []
      for await (
        const msg of client.fetch(
          toProcess,
          { uid: true, envelope: true, source: true },
          { uid: true },
        )
      ) {
        const parsed = await simpleParser(msg.source)
        const envelope = msg.envelope ?? {}
        const fromAddr = envelope.from?.[0]
        rawMessages.push({
          uid: msg.uid,
          from: fromAddr
            ? [fromAddr.name, fromAddr.address ? `<${fromAddr.address}>` : ""]
              .filter(Boolean)
              .join(" ")
              .trim()
            : "unknown",
          subject: envelope.subject || "(no subject)",
          date: envelope.date || new Date(),
          body: extractBody(parsed.text, parsed.html),
        })
      }

      for (const raw of rawMessages) {
        try {
          log(`Classifying: "${raw.subject}"`)
          const classification = await classify(raw.from, raw.subject, raw.body, config)
          log(`  → [${classification.category}] ${classification.summary}`)

          await client.messageFlagsAdd(
            String(raw.uid),
            [TAG[classification.category], TAG_PROCESSED],
            { uid: true },
          )
          log(`  → tagged ${TAG[classification.category]}`)

          state.processed.push({ uid: raw.uid, processedAt: new Date().toISOString() })
          await saveState(state, config.dataPath)

          if (classification.category === "urgent") {
            await sendNtfyAlert(raw.from, raw.subject, classification, config).catch((err) =>
              logError(`ntfy failed for "${raw.subject}"`, err)
            )
          }
        } catch (err) {
          logError(`Failed to process "${raw.subject}"`, err)
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
    log("IMAP disconnected")
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig()
  log(`Mail AI starting — ${config.imapUser}`)
  log(`Poll: ${config.pollIntervalMs / 1000}s`)
  log(`Mode: IMAP keyword tags (emails stay in Inbox)`)

  while (true) {
    const state = await loadState(config.dataPath)
    pruneProcessed(state)

    try {
      await processEmails(config, state)
    } catch (err) {
      logError("processEmails failed", err)
    }

    log(`Sleeping ${config.pollIntervalMs / 1000}s...`)
    await sleep(config.pollIntervalMs)
  }
}

main().catch((err) => {
  logError("Fatal", err)
  Deno.exit(1)
})
