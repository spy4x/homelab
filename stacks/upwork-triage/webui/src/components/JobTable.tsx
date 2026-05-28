import { useState } from "npm:preact/hooks"
import type { JobRecord } from "../types.ts"

interface Props {
  jobs: JobRecord[]
  onSelect: (job: JobRecord) => void
}

const PAGE_SIZE = 20

export function JobTable({ jobs, onSelect }: Props) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<"all" | "Yes" | "No">("all")
  const [search, setSearch] = useState("")

  const filtered = jobs.filter((j) => {
    if (filter !== "all" && j.verdict !== filter) return false
    if (search && !j.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset to page 1 when filter/search changes
  const onChangeFilter = (v: typeof filter) => { setFilter(v); setPage(1) }
  const onChangeSearch = (v: string) => { setSearch(v); setPage(1) }

  const badge = (verdict: "Yes" | "No") =>
    verdict === "Yes"
      ? <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-900/50 text-green-400 border border-green-800">&#10003; Yes</span>
      : <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-900/50 text-red-400 border border-red-800">&#10007; No</span>

  return (
    <div class="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      {/* Toolbar */}
      <div class="flex flex-wrap items-center gap-3 p-4 border-b border-gray-800">
        <div class="flex gap-1">
          {(["all", "Yes", "No"] as const).map((f) => (
            <button
              onClick={() => onChangeFilter(f)}
              class={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filter === f ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {f === "all" ? "All" : f === "Yes" ? "Accepted" : "Filtered"}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search title…"
          value={search}
          onInput={(e) => onChangeSearch((e.target as HTMLInputElement).value)}
          class="flex-1 min-w-[160px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
        />
        <span class="text-xs text-gray-600">{filtered.length} jobs</span>
      </div>

      {/* Table */}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th class="text-left px-4 py-3 font-medium">Verdict</th>
              <th class="text-left px-4 py-3 font-medium">Title</th>
              <th class="text-left px-4 py-3 font-medium hidden sm:table-cell">Budget</th>
              <th class="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
              <th class="text-left px-4 py-3 font-medium hidden lg:table-cell">Notified</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800/50">
            {paged.map((job) => (
              <tr
                key={job.id}
                onClick={() => onSelect(job)}
                class="cursor-pointer hover:bg-gray-800/30 transition-colors"
              >
                <td class="px-4 py-3">{badge(job.verdict)}</td>
                <td class="px-4 py-3 text-gray-300 max-w-[280px] truncate">{job.title}</td>
                <td class="px-4 py-3 text-gray-500 hidden sm:table-cell">{job.budget ?? "—"}</td>
                <td class="px-4 py-3 text-gray-500 text-xs hidden md:table-cell whitespace-nowrap">
                  {new Date(job.processedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td class="px-4 py-3 hidden lg:table-cell">
                  {job.notified
                    ? <span class="text-green-500 text-xs">&#10003;</span>
                    : <span class="text-gray-600 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div class="flex items-center justify-between px-4 py-3 border-t border-gray-800">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            class="text-xs text-gray-500 disabled:opacity-30 px-3 py-1 rounded hover:text-white transition-colors"
          >
            Previous
          </button>
          <span class="text-xs text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            class="text-xs text-gray-500 disabled:opacity-30 px-3 py-1 rounded hover:text-white transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
