import { useEffect, useRef } from "npm:preact/hooks"
import Chart from "npm:chart.js/auto"
import type { JobRecord } from "../types.ts"

interface Props {
  jobs: JobRecord[]
}

function getWeekdayStats(jobs: JobRecord[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const counts: Record<string, { total: number; yes: number; no: number }> = {}
  for (const d of days) counts[d] = { total: 0, yes: 0, no: 0 }
  for (const j of jobs) {
    const day = days[new Date(j.processedAt).getDay()]
    if (day && counts[day]) {
      counts[day].total++
      if (j.verdict === "Yes") counts[day].yes++
      else counts[day].no++
    }
  }
  return days.map((d) => ({ day: d, ...counts[d] }))
}

function getDailyStats(jobs: JobRecord[]) {
  const map: Record<string, { total: number; yes: number; no: number }> = {}
  for (const j of jobs) {
    const date = j.processedAt.slice(0, 10)
    if (!map[date]) map[date] = { total: 0, yes: 0, no: 0 }
    map[date].total++
    if (j.verdict === "Yes") map[date].yes++
    else map[date].no++
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14) // last 14 days
}

export function Charts({ jobs }: Props) {
  const pieRef = useRef<HTMLCanvasElement>(null)
  const weekRef = useRef<HTMLCanvasElement>(null)
  const dailyRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!jobs.length) return
    const yes = jobs.filter((j) => j.verdict === "Yes").length
    const no = jobs.length - yes
    const charts: Chart[] = []

    if (pieRef.current) {
      charts.push(
        new Chart(pieRef.current, {
          type: "doughnut",
          data: {
            labels: ["Accepted", "Filtered"],
            datasets: [{
              data: [yes, no],
              backgroundColor: ["#22c55e", "#ef4444"],
              borderWidth: 0,
            }],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: "bottom", labels: { color: "#9ca3af" } },
            },
          },
        }),
      )
    }

    const weekData = getWeekdayStats(jobs)
    if (weekRef.current) {
      charts.push(
        new Chart(weekRef.current, {
          type: "bar",
          data: {
            labels: weekData.map((d) => d.day),
            datasets: [
              {
                label: "Accepted",
                data: weekData.map((d) => d.yes),
                backgroundColor: "#22c55e",
                borderRadius: 4,
              },
              {
                label: "Filtered",
                data: weekData.map((d) => d.no),
                backgroundColor: "#ef4444",
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom", labels: { color: "#9ca3af" } } },
            scales: {
              x: { ticks: { color: "#6b7280" }, grid: { display: false } },
              y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
            },
          },
        }),
      )
    }

    const dailyData = getDailyStats(jobs)
    if (dailyRef.current) {
      charts.push(
        new Chart(dailyRef.current, {
          type: "bar",
          data: {
            labels: dailyData.map((d) => d[0].slice(5)),
            datasets: [
              {
                label: "Accepted",
                data: dailyData.map((d) => d[1].yes),
                backgroundColor: "#22c55e",
                borderRadius: 4,
              },
              {
                label: "Filtered",
                data: dailyData.map((d) => d[1].no),
                backgroundColor: "#ef4444",
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom", labels: { color: "#9ca3af" } } },
            scales: {
              x: { ticks: { color: "#6b7280" }, grid: { display: false } },
              y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
            },
          },
        }),
      )
    }

    return () => charts.forEach((c) => c.destroy())
  }, [jobs])

  if (!jobs.length) return null

  return (
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Verdict Split
        </h3>
        <canvas ref={pieRef} />
      </div>
      <div class="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          By Weekday
        </h3>
        <canvas ref={weekRef} />
      </div>
      <div class="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Last 14 Days
        </h3>
        <canvas ref={dailyRef} />
      </div>
    </div>
  )
}
