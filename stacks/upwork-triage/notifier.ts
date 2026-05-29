import { type EvaluationResult, type INotificationModule, type VollnaPayload } from "./types.ts"

const TELEGRAM_API_BASE = "https://api.telegram.org"

export class TelegramNotifier implements INotificationModule {
  private botToken: string
  private chatId: string

  constructor() {
    this.botToken = Deno.env.get("UPWORK_TRIAGE_TELEGRAM_BOT_TOKEN") ?? ""
    this.chatId = Deno.env.get("UPWORK_TRIAGE_TELEGRAM_CHAT_ID") ?? ""

    if (!this.botToken) {
      throw new Error("UPWORK_TRIAGE_TELEGRAM_BOT_TOKEN is required")
    }
    if (!this.chatId) {
      throw new Error("UPWORK_TRIAGE_TELEGRAM_CHAT_ID is required")
    }
  }

  async notify(payload: VollnaPayload, result: EvaluationResult): Promise<void> {
    const ok = await this.sendTelegram(payload, result)
    if (ok) {
      console.log(
        JSON.stringify({
          event: "telegram.notification_sent",
          jobTitle: payload.title,
        }),
      )
    }
  }

  private async sendTelegram(
    payload: VollnaPayload,
    result: EvaluationResult,
  ): Promise<boolean> {
    // Build message: AI-generated notification text + hook in code block
    let text: string
    if (result.notificationText) {
      const hookBlock = result.applicationHook
        ? `\n\n<pre>${this.escapeHtml(result.applicationHook)}</pre>`
        : ""
      text = result.notificationText + hookBlock
    } else {
      text = this.buildMessage(payload, result)
    }

    const url = `${TELEGRAM_API_BASE}/bot${this.botToken}/sendMessage`

    const body: Record<string, unknown> = {
      chat_id: this.chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "Open Job", url: payload.url },
        ]],
      },
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(
          JSON.stringify({
            event: "telegram.api_error",
            status: response.status,
            body: errText,
          }),
        )
        return false
      }
      return true
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "telegram.request_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return false
    }
  }

  private buildMessage(
    payload: VollnaPayload,
    result: EvaluationResult,
  ): string {
    const lines: string[] = [
      `<b>${this.escapeHtml(payload.title)}</b>`,
      "",
    ]

    if (payload.budget) {
      lines.push(`💰 Budget: <b>${this.escapeHtml(payload.budget)}</b>`)
    }
    if (payload.duration) {
      lines.push(`📅 ${this.escapeHtml(payload.duration)}`)
    }

    lines.push("")
    lines.push(`📝 ${this.escapeHtml(result.reason)}`)
    lines.push("")

    if (result.applicationHook) {
      lines.push("<b>Proposal Hook:</b>")
      lines.push(`<pre>${this.escapeHtml(result.applicationHook)}</pre>`)
    }

    return lines.join("\n")
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }
}
