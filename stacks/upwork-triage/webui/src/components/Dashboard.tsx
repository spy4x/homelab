import type { JobRecord } from "../types.ts"
import { Charts } from "./Charts.tsx"

interface Props {
  jobs: JobRecord[]
}

export function Dashboard({ jobs }: Props) {
  const yes = jobs.filter((j) => j.verdict === "Yes")
  const no = jobs.filter((j) => j.verdict === "No")
  const acceptanceRate = jobs.length > 0 ? ((yes.length / jobs.length) * 100).toFixed(1) : "0.0"
  const notified = yes.filter((j) => j.notified).length

  return (
    <div class="space-y-6">
      {/* KPI cards */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total" value={jobs.length} color="text-gray-100" />
        <KPI label="Accepted" value={yes.length} color="text-green-400" />
        <KPI label="Filtered" value={no.length} color="text-red-400" />
        <KPI label="Acceptance" value={`${acceptanceRate}%`} color="text-purple-400" />
      </div>

      {/* Charts */}
      <Charts jobs={jobs} />
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div class="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
      <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p class={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
