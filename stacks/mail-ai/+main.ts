// Mail AI Filter
// Polls IMAP inbox, classifies emails with DeepSeek, tags them in-place
// (AI-Urgent / AI-Normal / AI-Noise IMAP keywords so they stay in Inbox),
// sends instant ntfy push for urgent mail, delivers an HTML morning digest.

import { ImapFlow } from "npm:imapflow@1"
import { simpleParser } from "npm:mailparser@3"
import nodemailer from "npm:nodemailer@6"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Config {
  imapHost: string
  imapPort: number
  imapUser: string
  imapPassword: string
  deepseekApiKey: string
  ntfyUrl: string // full URL incl. topic
  ntfyToken: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  digestTo: string
  digestHour: number // 0-23 in local timezone
  timezone: string
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

interface DigestItem {
  uid: number
  from: string
  subject: string
  date: string
  category: Category
  classification: Classification
  processedAt: string
}

interface ProcessedEntry {
  uid: number
  processedAt: string // ISO — used for TTL pruning
}

interface State {
  processed: ProcessedEntry[]
  digestQueue: DigestItem[]
  lastDigestDate: string // YYYY-MM-DD
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

noise   →  Background; skim in the digest
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
    smtpHost: require("MAIL_AI_SMTP_HOST"),
    smtpPort: parseInt(optional("MAIL_AI_SMTP_PORT", "587")),
    smtpUser: require("MAIL_AI_SMTP_USER"),
    smtpPassword: require("MAIL_AI_SMTP_PASSWORD"),
    smtpFrom: require("MAIL_AI_SMTP_FROM"),
    digestTo: require("MAIL_AI_DIGEST_TO"),
    digestHour: parseInt(optional("MAIL_AI_DIGEST_HOUR", "8")),
    timezone: optional("MAIL_AI_TIMEZONE", "UTC"),
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

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ─── State ────────────────────────────────────────────────────────────────────

const stateFile = (dataPath: string) => `${dataPath}/state.json`

async function loadState(dataPath: string): Promise<State> {
  try {
    const raw = await Deno.readTextFile(stateFile(dataPath))
    const parsed = JSON.parse(raw) as Partial<State>
    // Migrate: older state files may lack the `processed` field
    return {
      processed: parsed.processed ?? [],
      digestQueue: parsed.digestQueue ?? [],
      lastDigestDate: parsed.lastDigestDate ?? "",
    }
  } catch {
    return { processed: [], digestQueue: [], lastDigestDate: "" }
  }
}

async function saveState(state: State, dataPath: string): Promise<void> {
  await Deno.mkdir(dataPath, { recursive: true })
  await Deno.writeTextFile(stateFile(dataPath), JSON.stringify(state, null, 2))
}

/** Drop entries older than PROCESSED_TTL_DAYS to keep state.json lean */
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
    if (attempt > 1) await sleep(1000 * 2 ** (attempt - 1)) // 2s, 4s
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

async function sendNtfyAlert(item: DigestItem, config: Config): Promise<void> {
  const body = [
    `From: ${item.from}`,
    item.classification.urgency_reason ? `Why: ${item.classification.urgency_reason}` : "",
    "",
    item.classification.summary,
  ]
    .filter(Boolean)
    .join("\n")

  const res = await fetch(config.ntfyUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.ntfyToken}`,
      "Title": `🚨 ${item.subject}`,
      "Priority": "urgent",
      "Tags": "rotating_light,email",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body,
  })

  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`)
  log(`  ntfy sent: "${item.subject}"`)
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

      // Fetch all before iterating — avoids mid-loop IMAP state changes
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

          // Tag in-place; email stays in INBOX (Unified Inbox compatible)
          await client.messageFlagsAdd(
            String(raw.uid),
            [TAG[classification.category], TAG_PROCESSED],
            { uid: true },
          )
          log(`  → tagged ${TAG[classification.category]}`)

          const item: DigestItem = {
            uid: raw.uid,
            from: raw.from,
            subject: raw.subject,
            date: raw.date.toISOString(),
            category: classification.category,
            classification,
            processedAt: new Date().toISOString(),
          }

          state.processed.push({ uid: raw.uid, processedAt: item.processedAt })
          state.digestQueue.push(item)
          await saveState(state, config.dataPath)

          if (classification.category === "urgent") {
            await sendNtfyAlert(item, config).catch((err) =>
              logError(`ntfy failed for "${raw.subject}"`, err)
            )
          }
        } catch (err) {
          logError(`Failed to process "${raw.subject}"`, err)
          // Leave untagged — will retry next poll
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

// ─── Daily Digest ─────────────────────────────────────────────────────────────

function getTodayString(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date())
}

function getCurrentHour(timezone: string): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(new Date())
  return parseInt(s) % 24
}

function buildDigest(items: DigestItem[], date: string): { text: string; html: string } {
  const urgent = items.filter((i) => i.category === "urgent")
  const normal = items.filter((i) => i.category === "normal")
  const noise = items.filter((i) => i.category === "noise")

  const noiseTxns = noise
    .filter((i) => i.classification.is_transaction && i.classification.transaction_amount != null)
    .sort(
      (a, b) =>
        (b.classification.transaction_amount ?? 0) - (a.classification.transaction_amount ?? 0),
    )
  const noiseOther = noise.filter(
    (i) => !(i.classification.is_transaction && i.classification.transaction_amount != null),
  )

  // ── Plain text ──
  const txt: string[] = [
    `Daily Email Digest — ${date}`,
    `${items.length} email(s) processed`,
    "",
  ]

  const addTxtSection = (
    title: string,
    sectionItems: DigestItem[],
    extra?: (i: DigestItem) => string,
  ) => {
    txt.push(`═══ ${title} (${sectionItems.length}) ═══`)
    if (!sectionItems.length) {
      txt.push("  (none)", "")
      return
    }
    for (const item of sectionItems) {
      txt.push(`• ${item.from}`)
      txt.push(`  ${item.subject}`)
      if (item.classification.urgency_reason) txt.push(`  ⚠ ${item.classification.urgency_reason}`)
      if (extra) txt.push(`  ${extra(item)}`)
      txt.push(`  ${item.classification.summary}`, "")
    }
  }

  addTxtSection("URGENT — already notified", urgent)
  addTxtSection("NORMAL", normal)
  addTxtSection("NOISE — Transactions", noiseTxns, (i) => {
    const amt = i.classification.transaction_amount?.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })
    return `💳 ${i.classification.transaction_currency ?? ""} ${amt}`
  })
  addTxtSection("NOISE — Other", noiseOther)

  // ── HTML ──
  const itemRow = (item: DigestItem, extra?: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;vertical-align:top">
        <div style="font-weight:600;font-size:15px">${escHtml(item.subject)}</div>
        <div style="color:#666;font-size:12px;margin-top:2px">${escHtml(item.from)}</div>
        ${
    item.classification.urgency_reason
      ? `<div style="color:#c0392b;font-size:13px;margin-top:4px">⚠ ${
        escHtml(item.classification.urgency_reason)
      }</div>`
      : ""
  }
        ${extra ? `<div style="font-size:13px;font-weight:600;margin-top:4px">${extra}</div>` : ""}
        <div style="margin-top:6px;font-size:13px;color:#333;line-height:1.4">${
    escHtml(item.classification.summary)
  }</div>
      </td>
    </tr>`

  const htmlSection = (
    title: string,
    color: string,
    sectionItems: DigestItem[],
    extra?: (i: DigestItem) => string,
  ) => `
    <h3 style="margin:28px 0 10px;padding:8px 14px;background:${color};color:#fff;border-radius:5px;font-size:14px;letter-spacing:.5px">
      ${escHtml(title)} (${sectionItems.length})
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${
    sectionItems.length
      ? sectionItems.map((i) =>
        itemRow(
          i,
          extra
            ? `💳 ${escHtml(i.classification.transaction_currency ?? "")} ${
              i.classification.transaction_amount?.toLocaleString("en-US", {
                maximumFractionDigits: 2,
              }) ?? ""
            }`
            : undefined,
        )
      ).join("")
      : `<tr><td style="padding:10px 0;color:#999;font-style:italic">(none)</td></tr>`
  }
    </table>`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#222;line-height:1.5}</style>
</head>
<body>
  <h2 style="margin:0 0 4px;font-size:20px">Daily Email Digest</h2>
  <p style="margin:0 0 4px;color:#666;font-size:14px">${escHtml(date)}</p>
  <p style="margin:0 0 20px;color:#999;font-size:13px">${items.length} email(s) processed</p>
  ${htmlSection("🚨 URGENT — already notified", "#c0392b", urgent)}
  ${htmlSection("📬 NORMAL", "#2980b9", normal)}
  ${
    htmlSection("💳 NOISE — Transactions", "#27ae60", noiseTxns, (i) =>
      i.classification.transaction_currency ?? "")
  }
  ${htmlSection("🔇 NOISE — Other", "#7f8c8d", noiseOther)}
  <p style="margin-top:36px;font-size:11px;color:#bbb">Generated by mail-ai</p>
</body></html>`

  return { text: txt.join("\n"), html }
}

async function sendDigest(state: State, config: Config): Promise<void> {
  if (!state.digestQueue.length) {
    log("Digest: queue empty, skipping")
    return
  }

  const today = getTodayString(config.timezone)
  const subject = `Daily Digest — ${today} (${state.digestQueue.length} emails)`
  const { text, html } = buildDigest(state.digestQueue, today)

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    tls: { rejectUnauthorized: false },
  })

  await transporter.sendMail({
    from: config.smtpFrom,
    to: config.digestTo,
    subject,
    text,
    html,
  })
  log(`Digest sent: "${subject}"`)

  state.digestQueue = []
  state.lastDigestDate = today
  await saveState(state, config.dataPath)
}

async function checkAndSendDigest(config: Config, state: State): Promise<void> {
  const today = getTodayString(config.timezone)
  if (state.lastDigestDate === today) return

  const hour = getCurrentHour(config.timezone)
  if (hour < config.digestHour) return

  log(`Digest trigger (hour ${hour} >= ${config.digestHour})`)
  await sendDigest(state, config)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig()
  log(`Mail AI starting — ${config.imapUser}`)
  log(`Poll: ${config.pollIntervalMs / 1000}s | Digest: ${config.digestHour}:00 ${config.timezone}`)
  log(`Mode: IMAP keyword tags (emails stay in Inbox)`)

  while (true) {
    let state = await loadState(config.dataPath)
    pruneProcessed(state)

    try {
      await processEmails(config, state)
    } catch (err) {
      logError("processEmails failed", err)
    }

    state = await loadState(config.dataPath)

    try {
      await checkAndSendDigest(config, state)
    } catch (err) {
      logError("digest failed", err)
    }

    log(`Sleeping ${config.pollIntervalMs / 1000}s...`)
    await sleep(config.pollIntervalMs)
  }
}

main().catch((err) => {
  logError("Fatal", err)
  Deno.exit(1)
})
