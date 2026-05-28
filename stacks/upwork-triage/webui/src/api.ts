import type { JobRecord, JobsResponse } from "./types"

export async function fetchJobs(): Promise<JobRecord[]> {
  const res = await fetch("/api/jobs?limit=9999")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: JobsResponse = await res.json()
  return data.jobs
}
