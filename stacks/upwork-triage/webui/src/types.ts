export interface JobRecord {
  id: string
  title: string
  url: string
  description: string
  budget: string | null
  skills: string[] | null
  filterName?: string
  verdict: "Yes" | "No"
  reason: string
  applicationHook: string
  notified: boolean
  processedAt: string
}

export interface JobsResponse {
  total: number
  page: number
  limit: number
  jobs: JobRecord[]
}

export interface DayStats {
  date: string
  total: number
  yes: number
  no: number
}

export interface WeekdayStats {
  day: string
  total: number
  yes: number
  no: number
}
