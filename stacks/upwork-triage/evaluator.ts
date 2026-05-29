import { type EvaluationResult, type IEvaluatorModule, type VollnaPayload } from "./types.ts"

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"

export class DeepSeekEvaluator implements IEvaluatorModule {
  private systemPrompt: string
  private apiKey: string
  private model: string
  private requestTimeout: number
  private retryDelayMs: number

  constructor() {
    this.apiKey = Deno.env.get("UPWORK_TRIAGE_DEEPSEEK_API_KEY") ?? ""
    if (!this.apiKey) {
      throw new Error("UPWORK_TRIAGE_DEEPSEEK_API_KEY is required")
    }

    this.model = Deno.env.get("UPWORK_TRIAGE_DEEPSEEK_MODEL") || "deepseek-v4-flash"
    this.requestTimeout = parseInt(
      Deno.env.get("UPWORK_TRIAGE_DEEPSEEK_TIMEOUT_MS") || "30000",
      10,
    )
    this.retryDelayMs = parseInt(
      Deno.env.get("UPWORK_TRIAGE_RETRY_DELAY_MS") || "2000",
      10,
    )

    const promptPath = Deno.env.get("UPWORK_TRIAGE_PROMPT_PATH") || "./prompt.txt"
    this.systemPrompt = Deno.readTextFileSync(promptPath)
  }

  async evaluate(payload: VollnaPayload): Promise<EvaluationResult> {
    return this.evaluateWithRetry(payload, 2) // 1 initial + 1 retry
  }

  private async evaluateWithRetry(
    payload: VollnaPayload,
    attemptsLeft: number,
  ): Promise<EvaluationResult> {
    const messages = [
      { role: "system", content: this.systemPrompt },
      {
        role: "user",
        content: JSON.stringify(
          {
            title: payload.title,
            description: payload.description,
            budget: payload.budget,
            skills: payload.skills,
            clientCountry: payload.clientCountry,
            clientRating: payload.clientRating,
            clientReviews: payload.clientReviews,
            clientTotalSpent: payload.clientTotalSpent,
            duration: payload.duration,
            experienceLevel: payload.experienceLevel,
          },
          null,
          2,
        ),
      },
    ]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout)

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          max_tokens: 1000,
          reasoning_effort: "high",
          thinking: { type: "enabled" },
        }),
        signal: controller.signal,
      })

      if (response.status === 429 && attemptsLeft > 1) {
        // Rate limited — retry after delay
        console.error(
          JSON.stringify({
            event: "deepseek.rate_limited",
            retriesLeft: attemptsLeft - 1,
          }),
        )
        clearTimeout(timeoutId)
        await this.sleep(this.retryDelayMs)
        return this.evaluateWithRetry(payload, attemptsLeft - 1)
      }

      if (!response.ok) {
        const errBody = await response.text()

        // Retry on 5xx
        if (response.status >= 500 && attemptsLeft > 1) {
          console.error(
            JSON.stringify({
              event: "deepseek.server_error",
              status: response.status,
              retriesLeft: attemptsLeft - 1,
            }),
          )
          clearTimeout(timeoutId)
          await this.sleep(this.retryDelayMs)
          return this.evaluateWithRetry(payload, attemptsLeft - 1)
        }

        console.error(
          JSON.stringify({
            event: "deepseek.api_error",
            status: response.status,
            body: errBody,
          }),
        )
        return {
          verdict: "No",
          reason: `Evaluation API error (${response.status})`,
          applicationHook: "",
        }
      }

      const data = await response.json()
      const content: string = data?.choices?.[0]?.message?.content ?? ""

      if (!content) {
        console.error(
          JSON.stringify({
            event: "deepseek.empty_response",
            raw: data,
          }),
        )
        return {
          verdict: "No",
          reason: "Empty response from evaluation API",
          applicationHook: "",
        }
      }

      return this.parseResponse(content)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(
          JSON.stringify({
            event: "deepseek.timeout",
            timeoutMs: this.requestTimeout,
          }),
        )

        // Retry on timeout
        if (attemptsLeft > 1) {
          await this.sleep(this.retryDelayMs)
          return this.evaluateWithRetry(payload, attemptsLeft - 1)
        }

        return {
          verdict: "No",
          reason: "Evaluation timed out",
          applicationHook: "",
        }
      }

      // Network error — retry if attempts remain
      if (attemptsLeft > 1) {
        console.error(
          JSON.stringify({
            event: "deepseek.retrying",
            error: err instanceof Error ? err.message : String(err),
            retriesLeft: attemptsLeft - 1,
          }),
        )
        await this.sleep(this.retryDelayMs)
        return this.evaluateWithRetry(payload, attemptsLeft - 1)
      }

      console.error(
        JSON.stringify({
          event: "deepseek.request_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return {
        verdict: "No",
        reason: "Evaluation failed due to network error",
        applicationHook: "",
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /** Check DeepSeek API connectivity (used by health endpoint) */
  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return res.ok
    } catch {
      return false
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  private parseResponse(text: string): EvaluationResult {
    const verdictMatch = text.match(/\[VERDICT\]\s*(Yes|No)/i)
    const whyMatch = text.match(
      /\[WHY\]\s*([\s\S]*?)(?=\[APPLICATION(?: HOOK)?\]|$)/,
    )
    // APPLICATION HOOK — bounded by [TELEGRAM] or end-of-string
    let hookMatch = text.match(
      /\[APPLICATION HOOK\]\s*([\s\S]*?)(?=\[TELEGRAM\]|$)/,
    )
    if (!hookMatch) {
      hookMatch = text.match(/\[APPLICATION[^\]]*\]\s*([\s\S]*?)(?=\[TELEGRAM\]|$)/)
    }

    // TELEGRAM notification text
    const telegramMatch = text.match(/\[TELEGRAM\]\s*([\s\S]*)$/)

    const verdictRaw = verdictMatch?.[1]
    const verdict = verdictRaw?.toLowerCase() === "yes" ? "Yes" : "No"
    const reason = whyMatch?.[1]?.trim() || "No reason provided by evaluator"
    const applicationHook = verdict === "Yes" ? (hookMatch?.[1]?.trim() || "") : ""
    const notificationText = telegramMatch?.[1]?.trim()

    return { verdict, reason, applicationHook, notificationText }
  }
}
