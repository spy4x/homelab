import { type EvaluationResult, type IEvaluatorModule, type VollnaPayload } from "./types.ts"

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"

export class DeepSeekEvaluator implements IEvaluatorModule {
  private systemPrompt: string
  private apiKey: string
  private model: string
  private requestTimeout: number

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

    const promptPath = Deno.env.get("UPWORK_TRIAGE_PROMPT_PATH") || "./prompt.txt"
    this.systemPrompt = Deno.readTextFileSync(promptPath)
  }

  async evaluate(payload: VollnaPayload): Promise<EvaluationResult> {
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
          max_tokens: 600,
          reasoning_effort: "high",
          thinking: { type: "enabled" },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errBody = await response.text()
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
        return {
          verdict: "No",
          reason: "Evaluation timed out",
          applicationHook: "",
        }
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

  private parseResponse(text: string): EvaluationResult {
    const verdictMatch = text.match(/\[VERDICT\]\s*(Yes|No)/i)
    const whyMatch = text.match(
      /\[WHY\]\s*([\s\S]*?)(?=\[APPLICATION HOOK\]|$)/,
    )
    const hookMatch = text.match(/\[APPLICATION HOOK\]\s*([\s\S]*)$/)

    const verdictRaw = verdictMatch?.[1]
    const verdict = verdictRaw?.toLowerCase() === "yes" ? "Yes" : "No"
    const reason = whyMatch?.[1]?.trim() || "No reason provided by evaluator"
    const applicationHook = verdict === "Yes" ? (hookMatch?.[1]?.trim() || "") : ""

    return { verdict, reason, applicationHook }
  }
}
