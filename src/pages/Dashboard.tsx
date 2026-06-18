import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { supabase } from '../lib/supabase'
import '../styles/dashboard.css'

type ProjectRecord = Record<string, any>

type DrilldownState = {
  title: string
  subtitle: string
  projects: ProjectRecord[]
}

type LguChartItem = {
  lgu: string
  count: number
}

type AccomplishmentChartItem = {
  name: string
  physical: number
  financial: number
}

const MODAL_CLOSE_DELAY = 190

const CHART_COLORS = [
  '#1d4ed8',
  '#f97316',
  '#16a34a',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#475569',
]

const STATUS_FALLBACK = 'Not Yet Started'
const RISK_FALLBACK = 'Unspecified'
const LGU_FALLBACK = 'Unspecified LGU'

function safeText(value: unknown, fallback = 'N/A') {
  if (value === null || value === undefined) return fallback

  const text = String(value).trim()
  return text.length > 0 ? text : fallback
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const cleaned = String(value).replace(/[^\d.-]/g, '')
  const parsed = Number(cleaned)

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeForCompare(value: unknown) {
  return safeText(value, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getRiskColor(riskLevel: unknown, fallbackIndex = 0) {
  const risk = normalizeForCompare(riskLevel)

  if (risk.includes('high')) return '#dc2626'
  if (risk.includes('moderate') || risk.includes('medium')) return '#f97316'
  if (risk.includes('low')) return '#16a34a'
  if (risk.includes('none') || risk.includes('no risk')) return '#1d4ed8'
  if (risk.includes('unspecified') || risk.includes('n/a')) return '#64748b'

  return CHART_COLORS[fallbackIndex % CHART_COLORS.length]
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: unknown) {
  const number = asNumber(value)

  return `${new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 2,
  }).format(number)}%`
}

function formatProjectCost(value: unknown) {
  const amount = asNumber(value)

  if (amount >= 1_000_000_000) {
    return `Php ${(amount / 1_000_000_000).toFixed(2)}B`
  }

  if (amount >= 1_000_000) {
    return `Php ${(amount / 1_000_000).toFixed(2)}M`
  }

  if (amount >= 1_000) {
    return `Php ${(amount / 1_000).toFixed(2)}K`
  }

  return `Php ${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

function formatFullProjectCost(value: unknown) {
  const amount = asNumber(value)

  return `Php ${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

function formatDate(value: unknown) {
  const text = safeText(value, '')

  if (!text) return 'N/A'

  const date = new Date(text)

  if (Number.isNaN(date.getTime())) return text

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getProjectId(project: ProjectRecord) {
  return safeText(
    project.id ??
      project.project_id ??
      project.projectId ??
      project.uuid ??
      project.project_uuid,
    '',
  )
}

function getProjectName(project: ProjectRecord) {
  return safeText(
    project.project_name ??
      project.name ??
      project.title ??
      project.project_title ??
      project.projectTitle,
    'Untitled Project',
  )
}

function getLocation(project: ProjectRecord) {
  const barangay = safeText(
    project.barangay ?? project.brgy ?? project.barangay_name,
    '',
  )

  const municipality = safeText(
    project.city_municipality ??
      project.municipality ??
      project.city ??
      project.lgu ??
      project.lgu_name ??
      project.location,
    '',
  )

  const province = safeText(project.province ?? project.province_name, '')

  const parts = [barangay, municipality, province].filter(Boolean)

  if (parts.length > 0) return parts.join(', ')

  return safeText(project.location ?? project.project_location, 'N/A')
}

function getLgu(project: ProjectRecord) {
  return safeText(
    project.city_municipality ??
      project.municipality ??
      project.city ??
      project.lgu ??
      project.lgu_name ??
      project.implementing_lgu ??
      project.location,
    LGU_FALLBACK,
  )
}

function getStatus(project: ProjectRecord) {
  return safeText(
    project.status ??
      project.project_status ??
      project.implementation_status ??
      project.current_status,
    STATUS_FALLBACK,
  )
}

function getRiskLevel(project: ProjectRecord) {
  return safeText(
    project.risk_level ??
      project.risk ??
      project.risk_status ??
      project.project_risk_level,
    RISK_FALLBACK,
  )
}

function getProjectCost(project: ProjectRecord) {
  return asNumber(
    project.project_cost ??
      project.total_project_cost ??
      project.approved_project_cost ??
      project.budget ??
      project.amount ??
      project.allocation ??
      project.allocated_amount ??
      project.contract_amount,
  )
}

function getFundingSource(project: ProjectRecord) {
  return safeText(
    project.funding_source ??
      project.source_of_fund ??
      project.fund_source ??
      project.program ??
      project.program_name,
    'N/A',
  )
}

function getImplementingOffice(project: ProjectRecord) {
  return safeText(
    project.implementing_office ??
      project.implementing_agency ??
      project.office ??
      project.contractor ??
      project.implementer,
    'N/A',
  )
}

function getTargetCompletion(project: ProjectRecord) {
  return (
    project.target_completion_date ??
    project.target_completion ??
    project.completion_date ??
    project.end_date ??
    project.date_completion
  )
}

function getPhysicalProgress(project: ProjectRecord) {
  return asNumber(
    project.physical_accomplishment ??
      project.physical_progress ??
      project.physical_percentage ??
      project.physical ??
      project.actual_physical,
  )
}

function getFinancialProgress(project: ProjectRecord) {
  return asNumber(
    project.financial_accomplishment ??
      project.financial_progress ??
      project.financial_percentage ??
      project.financial ??
      project.actual_financial,
  )
}

function getLatitude(project: ProjectRecord) {
  return asNumber(
    project.latest_latitude ??
      project.latitude ??
      project.lat ??
      project.project_latitude ??
      project.gps_latitude ??
      project.current_latitude,
  )
}

function getLongitude(project: ProjectRecord) {
  return asNumber(
    project.latest_longitude ??
      project.longitude ??
      project.lng ??
      project.long ??
      project.project_longitude ??
      project.gps_longitude ??
      project.current_longitude,
  )
}

function hasGps(project: ProjectRecord) {
  const latitude = getLatitude(project)
  const longitude = getLongitude(project)

  return latitude !== 0 && longitude !== 0
}

function getUpdatedTime(project: ProjectRecord) {
  const value =
    project.updated_at ??
    project.last_updated_at ??
    project.latest_update_at ??
    project.modified_at ??
    project.created_at

  const date = new Date(safeText(value, ''))

  if (Number.isNaN(date.getTime())) return 0

  return date.getTime()
}

function countBy<T extends ProjectRecord>(
  projects: T[],
  getter: (project: T) => string,
) {
  const map = new Map<string, number>()

  projects.forEach((project) => {
    const key = safeText(getter(project), 'Unspecified')
    map.set(key, (map.get(key) ?? 0) + 1)
  })

  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function average(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value))

  if (validValues.length === 0) return 0

  return (
    validValues.reduce((total, current) => total + current, 0) /
    validValues.length
  )
}

function isStatus(project: ProjectRecord, keywords: string[]) {
  const status = normalizeForCompare(getStatus(project))

  return keywords.some((keyword) => status.includes(keyword))
}

function isRisk(project: ProjectRecord, keywords: string[]) {
  const risk = normalizeForCompare(getRiskLevel(project))

  return keywords.some((keyword) => risk.includes(keyword))
}

export default function Dashboard() {
  const navigate = useNavigate()

  const modalCloseTimerRef = useRef<number | null>(null)

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null)
  const [isDrilldownClosing, setIsDrilldownClosing] = useState(false)

  useEffect(() => {
    loadProjects()

    return () => {
      if (modalCloseTimerRef.current) {
        window.clearTimeout(modalCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!drilldown) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrilldown()
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [drilldown])

  async function loadProjects() {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.from('projects').select('*')

    if (error) {
      setErrorMessage(error.message)
      setProjects([])
      setLoading(false)
      return
    }

    const sortedProjects = ((data ?? []) as ProjectRecord[]).sort(
      (a, b) => getUpdatedTime(b) - getUpdatedTime(a),
    )

    setProjects(sortedProjects)
    setLoading(false)
  }

  function openDrilldown(
    title: string,
    subtitle: string,
    selectedProjects: ProjectRecord[],
  ) {
    if (modalCloseTimerRef.current) {
      window.clearTimeout(modalCloseTimerRef.current)
    }

    setIsDrilldownClosing(false)
    setDrilldown({
      title,
      subtitle,
      projects: selectedProjects,
    })
  }

  function closeDrilldown() {
    if (!drilldown || isDrilldownClosing) return

    setIsDrilldownClosing(true)

    modalCloseTimerRef.current = window.setTimeout(() => {
      setDrilldown(null)
      setIsDrilldownClosing(false)
    }, MODAL_CLOSE_DELAY)
  }

  const dashboardData = useMemo(() => {
    const totalProjects = projects.length

    const totalProjectCost = projects.reduce(
      (total, project) => total + getProjectCost(project),
      0,
    )

    const ongoingProjects = projects.filter((project) =>
      isStatus(project, ['ongoing', 'on going', 'in progress', 'implementation']),
    )

    const completedProjects = projects.filter((project) =>
      isStatus(project, ['completed', 'complete', 'finished']),
    )

    const notStartedProjects = projects.filter((project) =>
      isStatus(project, [
        'not yet started',
        'not started',
        'pending',
        'not implemented',
      ]),
    )

    const cancelledProjects = projects.filter((project) =>
      isStatus(project, ['cancelled', 'canceled']),
    )

    const terminatedProjects = projects.filter((project) =>
      isStatus(project, ['terminated']),
    )

    const highRiskProjects = projects.filter((project) =>
      isRisk(project, ['high']),
    )

    const moderateRiskProjects = projects.filter((project) =>
      isRisk(project, ['moderate', 'medium']),
    )

    const lowRiskProjects = projects.filter((project) =>
      isRisk(project, ['low']),
    )

    const gpsProjects = projects.filter(hasGps)

    const statusData = countBy(projects, getStatus)
    const riskData = countBy(projects, getRiskLevel)

    const lguMap = new Map<string, number>()

    projects.forEach((project) => {
      const lgu = getLgu(project)
      lguMap.set(lgu, (lguMap.get(lgu) ?? 0) + 1)
    })

    const lguData = Array.from(lguMap.entries())
      .map(([lgu, count]) => ({ lgu, count }))
      .sort((a, b) => b.count - a.count || a.lgu.localeCompare(b.lgu))
      .slice(0, 8)

    const averagePhysical = average(projects.map(getPhysicalProgress))
    const averageFinancial = average(projects.map(getFinancialProgress))

    const accomplishmentData: AccomplishmentChartItem[] = [
      {
        name: 'Average',
        physical: Number(averagePhysical.toFixed(2)),
        financial: Number(averageFinancial.toFixed(2)),
      },
    ]

    const latestProjects = [...projects]
      .sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a))
      .slice(0, 5)

    return {
      totalProjects,
      totalProjectCost,
      ongoingProjects,
      completedProjects,
      notStartedProjects,
      cancelledProjects,
      terminatedProjects,
      highRiskProjects,
      moderateRiskProjects,
      lowRiskProjects,
      gpsProjects,
      statusData,
      riskData,
      lguData,
      averagePhysical,
      averageFinancial,
      accomplishmentData,
      latestProjects,
    }
  }, [projects])

  function renderProjectCard(project: ProjectRecord) {
    const projectId = getProjectId(project)

    return (
      <article
        className="dashboard-modal-project-card"
        key={projectId || getProjectName(project)}
      >
        <div className="dashboard-modal-project-main">
          <div>
            <p className="dashboard-modal-project-kicker">
              {getFundingSource(project)}
            </p>
            <h3>{getProjectName(project)}</h3>
            <p className="dashboard-modal-project-location">
              {getLocation(project)}
            </p>
          </div>

          <button
            type="button"
            className="dashboard-modal-view-btn"
            disabled={!projectId}
            onClick={() => {
              if (!projectId) return
              closeDrilldown()
              navigate(`/projects/${projectId}`)
            }}
          >
            View Details
          </button>
        </div>

        <div className="dashboard-modal-project-grid">
          <div>
            <span>Status</span>
            <strong>{getStatus(project)}</strong>
          </div>

          <div>
            <span>Risk Level</span>
            <strong>{getRiskLevel(project)}</strong>
          </div>

          <div>
            <span>Project Cost</span>
            <strong>{formatFullProjectCost(getProjectCost(project))}</strong>
          </div>

          <div>
            <span>Implementing Office</span>
            <strong>{getImplementingOffice(project)}</strong>
          </div>

          <div>
            <span>Target Completion</span>
            <strong>{formatDate(getTargetCompletion(project))}</strong>
          </div>

          <div>
            <span>GPS</span>
            <strong>{hasGps(project) ? 'Available' : 'No GPS'}</strong>
          </div>
        </div>

        <div className="dashboard-modal-progress-row">
          <div>
            <div className="dashboard-progress-label">
              <span>Physical</span>
              <strong>{formatPercent(getPhysicalProgress(project))}</strong>
            </div>

            <div className="dashboard-progress-track">
              <span
                style={{
                  width: `${Math.min(getPhysicalProgress(project), 100)}%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="dashboard-progress-label">
              <span>Financial</span>
              <strong>{formatPercent(getFinancialProgress(project))}</strong>
            </div>

            <div className="dashboard-progress-track">
              <span
                style={{
                  width: `${Math.min(getFinancialProgress(project), 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </article>
    )
  }

  function renderModal() {
    if (!drilldown) return null

    return createPortal(
      <div
        className={`dashboard-modal-backdrop ${
          isDrilldownClosing ? 'is-closing' : ''
        }`}
        role="presentation"
        onClick={closeDrilldown}
      >
        <section
          className={`dashboard-drilldown-modal ${
            isDrilldownClosing ? 'is-closing' : ''
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-drilldown-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="dashboard-modal-header">
            <div>
              <p className="dashboard-modal-eyebrow">Dashboard Drilldown</p>
              <h2 id="dashboard-drilldown-title">{drilldown.title}</h2>
              <p>{drilldown.subtitle}</p>
            </div>

            <button
              type="button"
              className="dashboard-modal-close"
              onClick={closeDrilldown}
              aria-label="Close dashboard drilldown"
            >
              ×
            </button>
          </header>

          <div className="dashboard-modal-summary-strip">
            <div>
              <span>Total Records</span>
              <strong>{formatCount(drilldown.projects.length)}</strong>
            </div>

            <div>
              <span>Total Project Cost</span>
              <strong>
                {formatProjectCost(
                  drilldown.projects.reduce(
                    (total, project) => total + getProjectCost(project),
                    0,
                  ),
                )}
              </strong>
            </div>

            <div>
              <span>With GPS</span>
              <strong>
                {formatCount(drilldown.projects.filter(hasGps).length)}
              </strong>
            </div>
          </div>

          <div className="dashboard-modal-body">
            {drilldown.projects.length > 0 ? (
              drilldown.projects.map(renderProjectCard)
            ) : (
              <div className="dashboard-empty-state">
                <strong>No projects found</strong>
                <p>There are no records under this selected category.</p>
              </div>
            )}
          </div>
        </section>
      </div>,
      document.body,
    )
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-loading-card">
          <span className="dashboard-loader" />

          <div>
            <h2>Loading dashboard</h2>
            <p>Please wait while project records are being prepared.</p>
          </div>
        </div>
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-error-card">
          <p className="dashboard-eyebrow">Dashboard Error</p>
          <h2>Unable to load dashboard records</h2>
          <p>{errorMessage}</p>

          <button type="button" onClick={loadProjects}>
            Try Again
          </button>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="dashboard-page">
        <section className="dashboard-hero">
          <div>
            <p className="dashboard-eyebrow">DILG Region X</p>
            <h1>PDMU Project Monitoring Dashboard</h1>
            <p>
              Monitor implementation status, project cost, risk level, GPS
              coverage, and accomplishment summaries.
            </p>
          </div>

          <div className="dashboard-hero-panel">
            <span>Total Project Cost</span>
            <strong>{formatProjectCost(dashboardData.totalProjectCost)}</strong>
            <small>
              {formatCount(dashboardData.totalProjects)} enrolled projects
            </small>
          </div>
        </section>

        <section className="dashboard-stat-grid">
          <button
            type="button"
            className="dashboard-stat-card"
            onClick={() =>
              openDrilldown(
                'All Projects',
                'Complete list of enrolled projects.',
                projects,
              )
            }
          >
            <span>Total Projects</span>
            <strong>{formatCount(dashboardData.totalProjects)}</strong>
            <small>All project records</small>
          </button>

          <button
            type="button"
            className="dashboard-stat-card"
            onClick={() =>
              openDrilldown(
                'Total Project Cost',
                'All projects included in the total project cost.',
                projects,
              )
            }
          >
            <span>Total Project Cost</span>
            <strong>{formatProjectCost(dashboardData.totalProjectCost)}</strong>
            <small>Combined project cost</small>
          </button>

          <button
            type="button"
            className="dashboard-stat-card"
            onClick={() =>
              openDrilldown(
                'Ongoing Projects',
                'Projects currently under implementation.',
                dashboardData.ongoingProjects,
              )
            }
          >
            <span>Ongoing</span>
            <strong>{formatCount(dashboardData.ongoingProjects.length)}</strong>
            <small>Under implementation</small>
          </button>

          <button
            type="button"
            className="dashboard-stat-card"
            onClick={() =>
              openDrilldown(
                'Completed Projects',
                'Projects tagged as completed.',
                dashboardData.completedProjects,
              )
            }
          >
            <span>Completed</span>
            <strong>
              {formatCount(dashboardData.completedProjects.length)}
            </strong>
            <small>Finished projects</small>
          </button>

          <button
            type="button"
            className="dashboard-stat-card danger"
            onClick={() =>
              openDrilldown(
                'High Risk Projects',
                'Projects requiring close monitoring and follow-through.',
                dashboardData.highRiskProjects,
              )
            }
          >
            <span>High Risk</span>
            <strong>{formatCount(dashboardData.highRiskProjects.length)}</strong>
            <small>Needs attention</small>
          </button>

          <button
            type="button"
            className="dashboard-stat-card"
            onClick={() =>
              openDrilldown(
                'Projects With GPS',
                'Projects with available latitude and longitude coordinates.',
                dashboardData.gpsProjects,
              )
            }
          >
            <span>With GPS</span>
            <strong>{formatCount(dashboardData.gpsProjects.length)}</strong>
            <small>Map-ready records</small>
          </button>
        </section>

        <section className="dashboard-main-grid">
          <article className="dashboard-chart-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Status</p>
                <h2>Projects by Status</h2>
              </div>

              <span>{formatCount(dashboardData.totalProjects)} total</span>
            </div>

            <div className="dashboard-chart-area">
              {dashboardData.statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={dashboardData.statusData}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={102}
                      paddingAngle={2}
                      cursor="pointer"
                      onClick={(entry: any) => {
                        const name = safeText(entry?.name, '')
                        const selected = projects.filter(
                          (project) => getStatus(project) === name,
                        )

                        openDrilldown(
                          `${name} Projects`,
                          `Projects currently categorized as ${name}.`,
                          selected,
                        )
                      }}
                    >
                      {dashboardData.statusData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value) => [
                        formatCount(asNumber(value)),
                        'Projects',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="dashboard-empty-state compact">
                  <strong>No status data</strong>
                  <p>No project status records available.</p>
                </div>
              )}
            </div>

            <div className="dashboard-legend-list">
              {dashboardData.statusData.map((item, index) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() =>
                    openDrilldown(
                      `${item.name} Projects`,
                      `Projects currently categorized as ${item.name}.`,
                      projects.filter(
                        (project) => getStatus(project) === item.name,
                      ),
                    )
                  }
                >
                  <i
                    style={{
                      backgroundColor:
                        CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                  <span>{item.name}</span>
                  <strong>{formatCount(item.count)}</strong>
                </button>
              ))}
            </div>
          </article>

          <article className="dashboard-chart-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Risk</p>
                <h2>Projects by Risk Level</h2>
              </div>

              <span>
                {formatCount(dashboardData.highRiskProjects.length)} high risk
              </span>
            </div>

            <div className="dashboard-chart-area">
              {dashboardData.riskData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={dashboardData.riskData}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={102}
                      paddingAngle={2}
                      cursor="pointer"
                      onClick={(entry: any) => {
                        const name = safeText(entry?.name, '')
                        const selected = projects.filter(
                          (project) => getRiskLevel(project) === name,
                        )

                        openDrilldown(
                          `${name} Risk Projects`,
                          `Projects currently tagged as ${name} risk.`,
                          selected,
                        )
                      }}
                    >
                      {dashboardData.riskData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={getRiskColor(entry.name, index)}
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value) => [
                        formatCount(asNumber(value)),
                        'Projects',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="dashboard-empty-state compact">
                  <strong>No risk data</strong>
                  <p>No risk level records available.</p>
                </div>
              )}
            </div>

            <div className="dashboard-legend-list">
              {dashboardData.riskData.map((item, index) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() =>
                    openDrilldown(
                      `${item.name} Risk Projects`,
                      `Projects currently tagged as ${item.name} risk.`,
                      projects.filter(
                        (project) => getRiskLevel(project) === item.name,
                      ),
                    )
                  }
                >
                  <i
                    style={{
                      backgroundColor: getRiskColor(item.name, index),
                    }}
                  />
                  <span>{item.name}</span>
                  <strong>{formatCount(item.count)}</strong>
                </button>
              ))}
            </div>
          </article>

          <article className="dashboard-chart-card wide">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">LGU Distribution</p>
                <h2>Top LGUs by Number of Projects</h2>
              </div>

              <span>Top {dashboardData.lguData.length}</span>
            </div>

            <div className="dashboard-chart-area tall">
              {dashboardData.lguData.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={dashboardData.lguData}
                    margin={{
                      top: 10,
                      right: 20,
                      left: 8,
                      bottom: 24,
                    }}
                    onClick={(state: any) => {
                      const item = state?.activePayload?.[0]
                        ?.payload as LguChartItem | null

                      if (!item) return

                      openDrilldown(
                        `${item.lgu} Projects`,
                        `Projects located in or implemented by ${item.lgu}.`,
                        projects.filter((project) => getLgu(project) === item.lgu),
                      )
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />

                    <XAxis
                      dataKey="lgu"
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />

                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                    />

                    <Tooltip
                      formatter={(value) => [
                        formatCount(asNumber(value)),
                        'Projects',
                      ]}
                    />

                    <Bar
                      dataKey="count"
                      radius={[10, 10, 0, 0]}
                      cursor="pointer"
                      fill="#1d4ed8"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="dashboard-empty-state compact">
                  <strong>No LGU data</strong>
                  <p>No LGU records available.</p>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-chart-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Accomplishment</p>
                <h2>Average Progress</h2>
              </div>

              <span>{formatPercent(dashboardData.averagePhysical)} physical</span>
            </div>

            <div className="dashboard-mini-bars">
              <button
                type="button"
                onClick={() =>
                  openDrilldown(
                    'Physical Accomplishment',
                    'All projects included in the average physical accomplishment.',
                    projects,
                  )
                }
              >
                <div>
                  <span>Average Physical</span>
                  <strong>{formatPercent(dashboardData.averagePhysical)}</strong>
                </div>

                <div className="dashboard-progress-track">
                  <span
                    style={{
                      width: `${Math.min(dashboardData.averagePhysical, 100)}%`,
                    }}
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  openDrilldown(
                    'Financial Accomplishment',
                    'All projects included in the average financial accomplishment.',
                    projects,
                  )
                }
              >
                <div>
                  <span>Average Financial</span>
                  <strong>{formatPercent(dashboardData.averageFinancial)}</strong>
                </div>

                <div className="dashboard-progress-track">
                  <span
                    style={{
                      width: `${Math.min(dashboardData.averageFinancial, 100)}%`,
                    }}
                  />
                </div>
              </button>
            </div>

            <div className="dashboard-chart-area small">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={dashboardData.accomplishmentData}
                  margin={{
                    top: 10,
                    right: 20,
                    left: 8,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />

                  <XAxis dataKey="name" tickLine={false} axisLine={false} />

                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}%`}
                  />

                  <Tooltip formatter={(value) => [formatPercent(value), '']} />

                  <Bar
                    dataKey="physical"
                    name="Physical"
                    radius={[8, 8, 0, 0]}
                    fill="#1d4ed8"
                  />

                  <Bar
                    dataKey="financial"
                    name="Financial"
                    radius={[8, 8, 0, 0]}
                    fill="#f97316"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="dashboard-detail-grid">
          <article className="dashboard-list-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Priority Review</p>
                <h2>High Risk Projects</h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  openDrilldown(
                    'High Risk Projects',
                    'Projects requiring close monitoring and follow-through.',
                    dashboardData.highRiskProjects,
                  )
                }
              >
                View All
              </button>
            </div>

            <div className="dashboard-project-list">
              {dashboardData.highRiskProjects.slice(0, 5).length > 0 ? (
                dashboardData.highRiskProjects.slice(0, 5).map((project) => (
                  <button
                    type="button"
                    key={getProjectId(project) || getProjectName(project)}
                    onClick={() =>
                      openDrilldown(
                        getProjectName(project),
                        'Selected high risk project record.',
                        [project],
                      )
                    }
                  >
                    <div>
                      <strong>{getProjectName(project)}</strong>
                      <span>{getLocation(project)}</span>
                    </div>

                    <em>{formatPercent(getPhysicalProgress(project))}</em>
                  </button>
                ))
              ) : (
                <div className="dashboard-empty-state compact">
                  <strong>No high risk projects</strong>
                  <p>No project is currently tagged as high risk.</p>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-list-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Recent Records</p>
                <h2>Latest Updated Projects</h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  openDrilldown(
                    'Latest Updated Projects',
                    'The five most recently updated project records.',
                    dashboardData.latestProjects,
                  )
                }
              >
                View
              </button>
            </div>

            <div className="dashboard-project-list">
              {dashboardData.latestProjects.length > 0 ? (
                dashboardData.latestProjects.map((project) => (
                  <button
                    type="button"
                    key={getProjectId(project) || getProjectName(project)}
                    onClick={() =>
                      openDrilldown(
                        getProjectName(project),
                        'Selected recently updated project record.',
                        [project],
                      )
                    }
                  >
                    <div>
                      <strong>{getProjectName(project)}</strong>
                      <span>{getLocation(project)}</span>
                    </div>

                    <em>{formatDate(project.updated_at ?? project.created_at)}</em>
                  </button>
                ))
              ) : (
                <div className="dashboard-empty-state compact">
                  <strong>No recent records</strong>
                  <p>No updated project records available.</p>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="dashboard-bottom-grid">
          <button
            type="button"
            onClick={() =>
              openDrilldown(
                'Not Yet Started Projects',
                'Projects that have not yet started implementation.',
                dashboardData.notStartedProjects,
              )
            }
          >
            <span>Not Yet Started</span>
            <strong>
              {formatCount(dashboardData.notStartedProjects.length)}
            </strong>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrilldown(
                'Moderate Risk Projects',
                'Projects currently tagged as moderate or medium risk.',
                dashboardData.moderateRiskProjects,
              )
            }
          >
            <span>Moderate Risk</span>
            <strong>
              {formatCount(dashboardData.moderateRiskProjects.length)}
            </strong>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrilldown(
                'Low Risk Projects',
                'Projects currently tagged as low risk.',
                dashboardData.lowRiskProjects,
              )
            }
          >
            <span>Low Risk</span>
            <strong>{formatCount(dashboardData.lowRiskProjects.length)}</strong>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrilldown(
                'Cancelled Projects',
                'Projects tagged as cancelled.',
                dashboardData.cancelledProjects,
              )
            }
          >
            <span>Cancelled</span>
            <strong>
              {formatCount(dashboardData.cancelledProjects.length)}
            </strong>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrilldown(
                'Terminated Projects',
                'Projects tagged as terminated.',
                dashboardData.terminatedProjects,
              )
            }
          >
            <span>Terminated</span>
            <strong>
              {formatCount(dashboardData.terminatedProjects.length)}
            </strong>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrilldown(
                'GPS Coverage',
                'Projects with available latitude and longitude coordinates.',
                dashboardData.gpsProjects,
              )
            }
          >
            <span>GPS Coverage</span>
            <strong>
              {dashboardData.totalProjects > 0
                ? `${Math.round(
                    (dashboardData.gpsProjects.length /
                      dashboardData.totalProjects) *
                      100,
                  )}%`
                : '0%'}
            </strong>
          </button>
        </section>
      </main>

      {renderModal()}
    </>
  )
}