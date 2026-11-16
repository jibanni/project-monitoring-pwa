import { useMemo, useRef, useState } from 'react'
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
    const grouped = new Map<string, StatusRow>()
    for (const project of projects) {
      const area = project.area.trim() || 'Unassigned'
      const row = grouped.get(area) ?? { area, total: 0, completed: 0, ongoing: 0, prestart: 0, other: 0 }
      row[statusKey(project.status)] += 1
      row.total += 1
      grouped.set(area, row)
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.area.localeCompare(b.area))
  }, [projects])
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const selected = rows.find((row) => row.area === selectedArea)
  const maximum = Math.max(1, ...rows.map((row) => row.total))

  return (
    <div className="pms110-province-chart">
      {rows.length === 0 ? <p className="pms110-province-empty">No projects match the current filters.</p> : (
        <div className="pms110-province-rows">
          {rows.map((row) => {
            const description = `${row.area}: ${row.total} projects. ${categories.map((item) => `${item.label}: ${row[item.key]}`).join('; ')}.`
            return (
              <button className="pms110-province-row" type="button" key={row.area}
                aria-label={`Show status breakdown for ${description}`} aria-haspopup="dialog"
                onClick={() => {
                  setSelectedArea(row.area)
                  dialogRef.current?.showModal()
                }}>
                <span className="pms110-province-label"><span>{row.area}</span><strong>{row.total.toLocaleString()}</strong></span>
                <span className="pms110-province-track" aria-hidden="true">
                  {categories.map((item) => row[item.key] > 0 && (
                    <span key={item.key} className="pms110-province-segment" style={{ width: `${row[item.key] / maximum * 100}%`, backgroundColor: item.color }}>
                      {row[item.key] / maximum >= 0.09 ? row[item.key] : ''}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
          <div className="pms110-province-axis" aria-hidden="true"><span>0</span><span>{maximum.toLocaleString()} projects</span></div>
        </div>
      )}
      {rows.length > 0 && <p className="pms110-province-hint">Select a province or HUC to see its status breakdown.</p>}
      <dialog ref={dialogRef} className="pms110-province-dialog" aria-label={selected ? `${selected.area} project status` : 'Province or HUC project status'}
        onClose={() => setSelectedArea(null)}>
        <div className="pms110-province-dialog-heading">
          <div><p>Project status breakdown</p><h3>{selected?.area || selectedArea || 'Province / HUC'}</h3></div>
          <button type="button" autoFocus onClick={() => dialogRef.current?.close()} aria-label="Close status breakdown">×</button>
        </div>
        {selected ? <ProvinceStatusBreakdown row={selected} />
          : <p>No projects in this area match the current filters.</p>}
      </dialog>
      <div className="pms110-province-legend">
        {categories.map((item) => <span key={item.key} title={item.key === 'other' ? 'Suspended, terminated, cancelled and unclassified projects' : item.label}><i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</span>)}
      </div>
    </div>
  )
}

type StatusRow = { area: string; total: number } & Record<StatusKey, number>

function ProvinceStatusBreakdown({ row }: { row: StatusRow }) {
  let offset = 0
  const slices = categories.flatMap((item) => {
    const count = row[item.key]
    if (!count) return []
    const start = offset
    offset += count
    return [`${item.color} ${start / row.total * 100}% ${offset / row.total * 100}%`]
  })
  return <div className="pms110-province-breakdown">
    <div className="pms110-province-pie" aria-hidden="true"
      style={{ backgroundImage: `conic-gradient(${slices.join(', ')})` }}>
      <div><strong>{row.total.toLocaleString()}</strong><span>{row.total === 1 ? 'project' : 'projects'}</span></div>
    </div>
    <ul aria-label={`Status totals for ${row.total.toLocaleString()} projects`}>
      {categories.map((item) => <li key={item.key}>
        <i style={{ backgroundColor: item.color }} aria-hidden="true" />
        <span>{item.label}</span>
        <strong>{row[item.key].toLocaleString()}</strong>
        <span>{(100 * row[item.key] / row.total).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
      </li>)}
    </ul>
  </div>
}
