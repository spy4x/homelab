import { useEffect, useState } from "npm:preact/hooks"
import type { JobRecord } from "../types.ts"

interface Props {
  job: JobRecord
  onClose: () => void
}

async function clip(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for Brave and other strict browsers
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function JobDetail({ job, onClose }: Props) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const copyHook = async () => {
    const ok = await clip(job.applicationHook)
    setCopyMsg(ok ? "Copied!" : "Copy failed")
    setTimeout(() => setCopyMsg(null), 2000)
  }

  const openJob = () => window.open(job.url, "_blank", "noopener")

  const badge = job.verdict === "Yes"
    ? (
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-900/40 text-green-400 border border-green-800">
        &#10003; Accepted
      </span>
    )
    : (
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-900/40 text-red-400 border border-red-800">
        &#10007; Filtered
      </span>
    )

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-white truncate">{job.title}</h2>
            <div class="flex items-center gap-3 mt-2">{badge}</div>
          </div>
          <button
            onClick={onClose}
            class="text-gray-600 hover:text-white shrink-0 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div class="p-6 space-y-5">
          {/* Meta */}
          <div class="flex flex-wrap gap-4 text-sm">
            {job.budget && (
              <div>
                <span class="text-gray-500 text-xs uppercase tracking-wider">Budget</span>
                <p class="text-gray-300 font-medium">{job.budget}</p>
              </div>
            )}
            <div>
              <span class="text-gray-500 text-xs uppercase tracking-wider">Date</span>
              <p class="text-gray-300">{new Date(job.processedAt).toLocaleString()}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase tracking-wider">Notified</span>
              <p class={job.notified ? "text-green-400" : "text-gray-500"}>
                {job.notified ? "Yes" : "No"}
              </p>
            </div>
            {job.filterName && (
              <div>
                <span class="text-gray-500 text-xs uppercase tracking-wider">Filter</span>
                <p class="text-gray-300">{job.filterName}</p>
              </div>
            )}
          </div>

          {/* Skills */}
          {Array.isArray(job.skills) && job.skills.length > 0 && (
            <div>
              <span class="text-gray-500 text-xs uppercase tracking-wider block mb-2">Skills</span>
              <div class="flex flex-wrap gap-1.5">
                {job.skills.map((s) => (
                  <span class="px-2.5 py-0.5 bg-gray-800 text-gray-300 rounded-md text-xs border border-gray-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wider block mb-1">
              Evaluation
            </span>
            <p class="text-gray-300 text-sm leading-relaxed">{job.reason}</p>
          </div>

          {/* Application Hook */}
          {job.applicationHook && (
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-gray-500 text-xs uppercase tracking-wider">Proposal Hook</span>
                <button
                  onClick={copyHook}
                  class={`text-xs transition-colors px-2 py-0.5 rounded border ${
                    copyMsg === "Copied!"
                      ? "text-green-400 border-green-800"
                      : copyMsg === "Copy failed"
                      ? "text-red-400 border-red-800"
                      : "text-purple-400 border-purple-800/50 hover:border-purple-600 hover:text-purple-300"
                  }`}
                >
                  {copyMsg ?? "Copy"}
                </button>
              </div>
              <pre class="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-400 leading-relaxed whitespace-pre-wrap font-sans">
                {job.applicationHook}
              </pre>
            </div>
          )}

          {/* Description */}
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wider block mb-1">
              Description
            </span>
            <p class="text-gray-500 text-sm leading-relaxed line-clamp-6">{job.description}</p>
          </div>
        </div>

        {/* Footer */}
        <div class="sticky bottom-0 bg-gray-900 border-t border-gray-800 px-6 py-4 flex gap-3">
          <button
            onClick={openJob}
            class="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Open Job &nearr;
          </button>
          <button
            onClick={onClose}
            class="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
