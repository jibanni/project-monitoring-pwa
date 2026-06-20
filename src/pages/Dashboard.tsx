import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import { supabase } from '../lib/supabase'
import '../styles/dashboard.css'

type ProjectRecord = Record<string, any>

type DrilldownState = {
  title: string
  subtitle: string
  projects: ProjectRecord[]
}

const MODAL_CLOSE_DELAY = 190

const CHART_COLORS = [
  '#16a34a',
  '#2563eb',
  '#64748b',
  '#ef4444',
  '#f97316',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
]

const STATUS_FALLBACK = 'Not Yet Started'
const RISK_FALLBACK = 'Unspecified'

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

function isStatus(project: ProjectRecord, keywords: string[]) {
  const status = normalizeForCompare(getStatus(project))

  return keywords.some((keyword) => status.includes(keyword))
}

function isRisk(project: ProjectRecord, keywords: string[]) {
  const risk = normalizeForCompare(getRiskLevel(project))

  return keywords.some((keyword) => risk.includes(keyword))
}

function getStatusColor(status: unknown, fallbackIndex = 0) {
  const normalized = normalizeForCompare(status)

  if (normalized.includes('ongoing') || normalized.includes('progress')) {
    return '#16a34a'
  }

  if (normalized.includes('complete') || normalized.includes('finished')) {
    return '#2563eb'
  }

  if (normalized.includes('not') || normalized.includes('pending')) {
    return '#64748b'
  }

  if (normalized.includes('cancel') || normalized.includes('terminate')) {
    return '#ef4444'
  }

  return CHART_COLORS[fallbackIndex % CHART_COLORS.length]
}

function getRiskColor(riskLevel: unknown, fallbackIndex = 0) {
  const risk = normalizeForCompare(riskLevel)

  if (risk.includes('high')) return '#ef4444'
  if (risk.includes('moderate') || risk.includes('medium')) return '#f97316'
  if (risk.includes('low')) return '#16a34a'
  if (risk.includes('none') || risk.includes('no risk')) return '#2563eb'

  return CHART_COLORS[fallbackIndex % CHART_COLORS.length]
}

export default function Dashboard() {
  const navigate = useNavigate()
  const modalCloseTimerRef = useRef<number | null>(null)

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null)
  const [isDrilldownClosing, setIsDrilldownClosing] = useState(false)
  const [isDashboardScrolled, setIsDashboardScrolled] = useState(false)

  useEffect(() => {
    loadProjects()

    return () => {
      if (modalCloseTimerRef.current) {
        window.clearTimeout(modalCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      requestAnimationFrame(() => {
        setIsDashboardScrolled(window.scrollY > 28)
        ticking = false
      })
    }

    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
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

    const highRiskProjects = projects.filter((project) =>
      isRisk(project, ['high']),
    )

    const forReviewProjects = projects.filter((project) =>
      isRisk(project, ['high', 'moderate', 'medium']),
    )

    const statusData = countBy(projects, getStatus)
    const riskData = countBy(projects, getRiskLevel)

    const latestProjects = [...projects]
      .sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a))
      .slice(0, 5)

    return {
      totalProjects: projects.length,
      ongoingProjects,
      completedProjects,
      notStartedProjects,
      highRiskProjects,
      forReviewProjects,
      statusData,
      riskData,
      latestProjects,
    }
  }, [projects])

  const statCards = [
    {
      key: 'total',
      label: 'Total Projects',
      value: dashboardData.totalProjects,
      helper: 'All records',
      className: 'total',
      title: 'All Projects',
      subtitle: 'Complete list of enrolled projects.',
      records: projects,
    },
    {
      key: 'ongoing',
      label: 'Ongoing',
      value: dashboardData.ongoingProjects.length,
      helper: 'Under implementation',
      className: 'ongoing',
      title: 'Ongoing Projects',
      subtitle: 'Projects currently under implementation.',
      records: dashboardData.ongoingProjects,
    },
    {
      key: 'completed',
      label: 'Completed',
      value: dashboardData.completedProjects.length,
      helper: 'Finished',
      className: 'completed',
      title: 'Completed Projects',
      subtitle: 'Projects tagged as completed.',
      records: dashboardData.completedProjects,
    },
    {
      key: 'not-started',
      label: 'Not Started',
      value: dashboardData.notStartedProjects.length,
      helper: 'Pending start',
      className: 'not-started',
      title: 'Not Yet Started Projects',
      subtitle: 'Projects that have not yet started implementation.',
      records: dashboardData.notStartedProjects,
    },
    {
      key: 'high-risk',
      label: 'High Risk',
      value: dashboardData.highRiskProjects.length,
      helper: 'Needs action',
      className: 'high-risk',
      title: 'High Risk Projects',
      subtitle: 'Projects requiring close monitoring and follow-through.',
      records: dashboardData.highRiskProjects,
    },
    {
      key: 'for-review',
      label: 'For Review',
      value: dashboardData.forReviewProjects.length,
      helper: 'Priority check',
      className: 'for-review',
      title: 'Projects for Review',
      subtitle: 'Projects tagged as high or moderate risk.',
      records: dashboardData.forReviewProjects,
    },
  ]

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
            View
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
            <span>Program</span>
            <strong>{getFundingSource(project)}</strong>
          </div>

          <div>
            <span>Office</span>
            <strong>{getImplementingOffice(project)}</strong>
          </div>

          <div>
            <span>Target</span>
            <strong>{formatDate(getTargetCompletion(project))}</strong>
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

            <div className="dashboard-progress-track financial">
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
              <p>
                {drilldown.subtitle} Showing {formatCount(drilldown.projects.length)}{' '}
                record{drilldown.projects.length === 1 ? '' : 's'}.
              </p>
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
      <main
        className={`dashboard-page ${
          isDashboardScrolled ? 'is-dashboard-scrolled' : ''
        }`}
      >
        <section className="dashboard-hero">
          <div>
            <p className="dashboard-eyebrow">DILG Region X</p>
            <h1>PDMU Project Monitoring Dashboard</h1>
            <p>
              Field-ready overview of implementation status, risk level, and
              priority records for monitoring.
            </p>
          </div>
        </section>

        <section className="dashboard-stat-grid" aria-label="Dashboard summary cards">
          {statCards.map((card) => (
            <button
              type="button"
              key={card.key}
              className={`dashboard-stat-card ${card.className}`}
              onClick={() =>
                openDrilldown(card.title, card.subtitle, card.records)
              }
            >
              <span>{card.label}</span>
              <strong>{formatCount(card.value)}</strong>
              <small>{card.helper}</small>
            </button>
          ))}
        </section>

        <section className="dashboard-priority-section">
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
        </section>

        <section className="dashboard-main-grid dashboard-chart-row">
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
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardData.statusData}
                      dataKey="count"
                      nameKey="name"
                      innerRadius="52%"
                      outerRadius="78%"
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
                          fill={getStatusColor(entry.name, index)}
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
                  <i style={{ backgroundColor: getStatusColor(item.name, index) }} />
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
                {formatCount(dashboardData.highRiskProjects.length)} high
              </span>
            </div>

            <div className="dashboard-chart-area">
              {dashboardData.riskData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardData.riskData}
                      dataKey="count"
                      nameKey="name"
                      innerRadius="52%"
                      outerRadius="78%"
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
                  <i style={{ backgroundColor: getRiskColor(item.name, index) }} />
                  <span>{item.name}</span>
                  <strong>{formatCount(item.count)}</strong>
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="dashboard-recent-section">
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
      </main>

      {renderModal()}
    </>
  )
}