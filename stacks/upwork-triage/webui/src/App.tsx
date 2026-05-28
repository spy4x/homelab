import { useEffect, useState } from "npm:preact/hooks"
import { fetchJobs } from "./api.ts"
import type { JobRecord } from "./types.ts"
import { Dashboard } from "./components/Dashboard.tsx"
import { JobTable } from "./components/JobTable.tsx"
import { JobDetail } from "./components/JobDetail.tsx"

function getIdFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/jobs\/([a-z0-9]+)$/i)
  return m?.[1] ?? null
}

function pushUrl(id: string | null): void {
  const url = id ? `/jobs/${id}` : "/"
  window.history.pushState({ jobId: id }, "", url)
}

export function App() {
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<JobRecord | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchJobs().then((data) => {
      setJobs(data)
      // restore job from URL if present
      const id = getIdFromUrl()
      if (id) {
        const found = data.find((j) => j.id === id)
        if (found) setSelected(found)
      }
    }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }

  // Initial load
  useEffect(() => {
    load()
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    const cb = () => {
      const id = getIdFromUrl()
      if (id) {
        const found = jobs.find((j) => j.id === id)
        if (found) setSelected(found)
        else setSelected(null)
      } else {
        setSelected(null)
      }
    }
    globalThis.addEventListener("popstate", cb)
    return () => globalThis.removeEventListener("popstate", cb)
  }, [jobs])

  const selectJob = (job: JobRecord) => {
    setSelected(job)
    pushUrl(job.id)
  }

  const closeJob = () => {
    setSelected(null)
    pushUrl(null)
  }

  const yesCount = jobs.filter((j) => j.verdict === "Yes").length
  const noCount = jobs.length - yesCount

  return (
    <div class="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white flex items-center gap-2">
            <span class="text-purple-400">&#9670;</span> Upwork Triage
          </h1>
          <p class="text-sm text-gray-500 mt-1">
            {loading
              ? "Loading…"
              : `${jobs.length} jobs · ${yesCount} accepted · ${noCount} filtered`}
          </p>
        </div>
        {!loading && (
          <button
            onClick={load}
            class="text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded border border-gray-800 hover:border-gray-600 transition-colors"
          >
            Refresh
          </button>
        )}
      </header>

      {error && (
        <div class="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && <div class="text-center py-20 text-gray-600 text-sm">Loading jobs…</div>}

      {!loading && !error && jobs.length === 0 && (
        <div class="text-center py-20 text-gray-600">
          <p class="text-lg mb-2">No jobs processed yet</p>
          <p class="text-sm">Waiting for Vollna webhooks…</p>
        </div>
      )}

      {!loading && !error && jobs.length > 0 && (
        <>
          <Dashboard jobs={jobs} />
          <JobTable jobs={jobs} onSelect={selectJob} />
        </>
      )}

      {selected && <JobDetail job={selected} onClose={closeJob} />}
    </div>
  )
}
