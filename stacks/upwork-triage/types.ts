// ── Individual job (evaluator/notifier internal) ──

export interface VollnaPayload {
  title: string
  description: string
  budget?: string
  url: string
  skills?: string[]
  clientCountry?: string
  clientRating?: number
  clientReviews?: number
  clientTotalSpent?: string
  postedAt?: string
  proposals?: string
  duration?: string
  experienceLevel?: string
  [key: string]: unknown
}

// ── Vollna webhook batch format ──

export interface VollnaProject {
  url: string
  title: string
  description: string
  [key: string]: unknown
}

export interface VollnaWebhookPayload {
  filter: {
    id: number
    name: string
    url: string
  }
  projects: VollnaProject[]
  total: number
  results_url: string
}

// ── Evaluation / notification ──

export interface EvaluationResult {
  verdict: "Yes" | "No"
  reason: string
  applicationHook: string
}

export interface JobRecord {
  id: string
  title: string
  url: string
  description: string
  budget?: string | null
  skills?: string[] | null
  filterName?: string
  verdict: "Yes" | "No"
  reason: string
  applicationHook: string
  notified: boolean
  processedAt: string
}

export interface IEvaluatorModule {
  evaluate(payload: VollnaPayload): Promise<EvaluationResult>
}

export interface INotificationModule {
  notify(payload: VollnaPayload, result: EvaluationResult): Promise<void>
}
