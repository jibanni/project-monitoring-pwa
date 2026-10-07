import { useMemo } from 'react'
import '../styles/provinceStatusChart.css'

type StatusProject = { area: string; status: string }
const categories = [
  { key: 'completed', label: 'Completed', color: '#16834b' },
  { key: 'ongoing', label: 'Ongoing', color: '#3b82c4' },
  { key: 'prestart', label: 'Not started / procurement', color: '#d69b20' },
  { key: 'other', label: 'Other statuses', color: '#9472b0' },
] as const
type StatusKey = (typeof categories)[number]['key']

function statusKey(status: string): StatusKey {
  if (status === 'Completed') return 'completed'
  if (status === 'Ongoing') return 'ongoing'
  if (status === 'Not Yet Started' || status === 'Under Procurement') return 'prestart'
  return 'other'
}

export default function ProvinceStatusChart({ projects }: { projects: StatusProject[] }) {
  const rows = useMemo(() => {
    const grouped = new Map<string, { area: string; total: number } & Record<StatusKey, number>>()
    for (const project of projects) {
      const area = project.area.trim() || 'Unassigned'
      const row = grouped.get(area) ?? { area, total: 0, completed: 0, ongoing: 0, prestart: 0, other: 0 }
      row[statusKey(project.status)] += 1
      row.total += 1
      grouped.set(area, row)
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.area.localeCompare(b.area))
  }, [projects])
  const maximum = Math.max(1, ...rows.map((row) => row.total))

  return (
    <div className="pms110-province-chart">
      {rows.length === 0 ? <p className="pms110-province-empty">No projects match the current filters.</p> : (
        <div className="pms110-province-rows">
          {rows.map((row) => {
            const description = `${row.area}: ${row.total} projects. ${categories.map((item) => `${item.label}: ${row[item.key]}`).join('; ')}.`
            return (
              <div className="pms110-province-row" key={row.area}>
                <div className="pms110-province-label"><span>{row.area}</span><strong>{row.total.toLocaleString()}</strong></div>
                <div className="pms110-province-track" role="img" aria-label={description} title={description}>
                  {categories.map((item) => row[item.key] > 0 && (
                    <span key={item.key} className="pms110-province-segment" style={{ width: `${row[item.key] / maximum * 100}%`, backgroundColor: item.color }}>
                      {row[item.key] / maximum >= 0.09 ? row[item.key] : ''}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="pms110-province-axis" aria-hidden="true"><span>0</span><span>{maximum.toLocaleString()} projects</span></div>
        </div>
      )}
      <div className="pms110-province-legend">
        {categories.map((item) => <span key={item.key} title={item.key === 'other' ? 'Suspended, terminated, cancelled and unclassified projects' : item.label}><i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</span>)}
      </div>
    </div>
  )
}
