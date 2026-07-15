import {
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
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
import { useAuth } from '../context/AuthContext'
import { filterProjectsByAor } from '../utils/aorAccess'
import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'
import { normalizeProgramName } from '../utils/program'

type ProjectRecord = Record<string, any>

type DrilldownState = {
  title: string
  subtitle: string
  projects: ProjectRecord[]
}


type DashboardFilters = {
  program: string
  year: string
  province: string
  lgu: string
}

const ALL_FILTER_VALUE = '__ALL__'

const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  program: ALL_FILTER_VALUE,
  year: ALL_FILTER_VALUE,
  province: ALL_FILTER_VALUE,
  lgu: ALL_FILTER_VALUE,
}

const MODAL_CLOSE_DELAY = 190
const DRILLDOWN_PAGE_SIZE = 80

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
  return getPmsProjectStatus(project)
}

function getRiskLevel(project: ProjectRecord) {
  return getPmsRiskLevel(project)
}

function getFundingSource(project: ProjectRecord) {
  const source = safeText(
    project.funding_source ??
      project.source_of_fund ??
      project.fund_source ??
      project.program ??
      project.program_name,
    'N/A',
  )

  const normalizedSource = normalizeProgramName(source)

  return normalizedSource || 'N/A'
}

function getFundingYear(project: ProjectRecord) {
  const rawValue = safeText(project.funding_year ?? project.fiscal_year ?? project.fy, '')

  if (!rawValue) return ''

  const cleanValue = rawValue.replace(/^FY\s*/i, '').trim()
  const yearNumber = Number(cleanValue)

  if (Number.isFinite(yearNumber)) {
    return `FY ${Math.trunc(yearNumber)}`
  }

  return rawValue.toUpperCase().startsWith('FY') ? rawValue : `FY ${rawValue}`
}

function getFundingDisplay(project: ProjectRecord) {
  const year = getFundingYear(project)
  const source = getFundingSource(project)

  if (year && source !== 'N/A') return `${year} · ${source}`
  return year || source
}


function getProgramFilterValue(project: ProjectRecord) {
  const source = getFundingSource(project)
  return source === 'N/A' ? '' : source
}

function getYearFilterValue(project: ProjectRecord) {
  return getFundingYear(project)
}

function getProvinceFilterValue(project: ProjectRecord) {
  return safeText(project.province ?? project.province_name, '')
}

function getLguFilterValue(project: ProjectRecord) {
  return safeText(
    project.city_municipality ??
      project.municipality ??
      project.city ??
      project.lgu ??
      project.lgu_name,
    '',
  )
}

function uniqueSortedTextValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => safeText(value, '')).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
}

function matchesDashboardFilter(value: string, filterValue: string) {
  if (filterValue === ALL_FILTER_VALUE) return true
  return value === filterValue
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
  const auth = useAuth()
  const modalCloseTimerRef = useRef<number | null>(null)

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null)
  const [isDrilldownClosing, setIsDrilldownClosing] = useState(false)
  const [drilldownVisibleCount, setDrilldownVisibleCount] = useState(DRILLDOWN_PAGE_SIZE)
  const [isDashboardScrolled, setIsDashboardScrolled] = useState(false)
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>(
    DEFAULT_DASHBOARD_FILTERS,
  )
  const [showDashboardFilters, setShowDashboardFilters] = useState(false)

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
    setDrilldownVisibleCount(DRILLDOWN_PAGE_SIZE)
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

  const aorProjects = useMemo(() => {
    return filterProjectsByAor(projects, auth)
  }, [projects, auth])

  const filterOptions = useMemo(() => {
    const years = uniqueSortedTextValues(aorProjects.map(getYearFilterValue)).sort(
      (a, b) => asNumber(b) - asNumber(a),
    )

    return {
      programs: uniqueSortedTextValues(aorProjects.map(getProgramFilterValue)),
      years,
      provinces: uniqueSortedTextValues(aorProjects.map(getProvinceFilterValue)),
      lgus: uniqueSortedTextValues(aorProjects.map(getLguFilterValue)),
    }
  }, [aorProjects])

  const hasActiveDashboardFilters = useMemo(() => {
    return Object.values(dashboardFilters).some(
      (value) => value !== ALL_FILTER_VALUE,
    )
  }, [dashboardFilters])

  const visibleProjects = useMemo(() => {
    return aorProjects.filter((project) => {
      return (
        matchesDashboardFilter(
          getProgramFilterValue(project),
          dashboardFilters.program,
        ) &&
        matchesDashboardFilter(getYearFilterValue(project), dashboardFilters.year) &&
        matchesDashboardFilter(
          getProvinceFilterValue(project),
          dashboardFilters.province,
        ) &&
        matchesDashboardFilter(getLguFilterValue(project), dashboardFilters.lgu)
      )
    })
  }, [aorProjects, dashboardFilters])

  const dashboardData = useMemo(() => {
    const underProcurementProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Under Procurement',
    )

    const notStartedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Not Yet Started',
    )

    const ongoingProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Ongoing',
    )

    const completedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Completed',
    )

    const suspendedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Suspended',
    )

    const terminatedProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Terminated',
    )

    const cancelledProjects = visibleProjects.filter(
      (project) => getStatus(project) === 'Cancelled',
    )

    const criticalStatusProjects = [
      ...suspendedProjects,
      ...terminatedProjects,
      ...cancelledProjects,
    ]

    const lowRiskProjects = visibleProjects.filter(
      (project) => getRiskLevel(project) === 'Low',
    )

    const mediumRiskProjects = visibleProjects.filter(
      (project) => getRiskLevel(project) === 'Moderate',
    )

    const highRiskProjects = visibleProjects.filter(
      (project) => getRiskLevel(project) === 'High',
    )

    const completionPendingProjects = visibleProjects.filter(
      (project) => getStatus(project) !== 'Completed',
    )

    const completionRemainingCount = Math.max(
      visibleProjects.length - completedProjects.length,
      0,
    )

    const completionRate =
      visibleProjects.length > 0
        ? Math.round((completedProjects.length / visibleProjects.length) * 100)
        : 0

    const completionData = [
      { name: 'Completed', count: completedProjects.length },
      { name: 'Remaining', count: completionRemainingCount },
    ].filter((item) => item.count > 0)

    const statusData = [
      { name: 'Under Procurement', count: underProcurementProjects.length },
      { name: 'Not Yet Started', count: notStartedProjects.length },
      { name: 'Ongoing', count: ongoingProjects.length },
      { name: 'Completed', count: completedProjects.length },
      { name: 'Suspended', count: suspendedProjects.length },
      { name: 'Terminated', count: terminatedProjects.length },
      { name: 'Cancelled', count: cancelledProjects.length },
    ].filter((item) => item.count > 0)

    const riskData = [
      { name: 'Low', count: lowRiskProjects.length },
      { name: 'Medium', count: mediumRiskProjects.length },
      { name: 'High', count: highRiskProjects.length },
    ].filter((item) => item.count > 0)

    const latestProjects = [...visibleProjects]
      .sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a))
      .slice(0, 5)

    return {
      totalProjects: visibleProjects.length,
      underProcurementProjects,
      notStartedProjects,
      ongoingProjects,
      completedProjects,
      suspendedProjects,
      terminatedProjects,
      cancelledProjects,
      criticalStatusProjects,
      lowRiskProjects,
      mediumRiskProjects,
      highRiskProjects,
      completionPendingProjects,
      completionRemainingCount,
      completionRate,
      completionData,
      statusData,
      riskData,
      latestProjects,
    }
  }, [visibleProjects])

  const statCards = [
    {
      key: 'total',
      label: 'Total Projects',
      value: dashboardData.totalProjects,
      helper: 'All records',
      className: 'total',
      title: 'All Projects',
      subtitle: 'Complete list of enrolled projects.',
      records: visibleProjects,
    },
    {
      key: 'under-procurement',
      label: 'Under Procurement',
      value: dashboardData.underProcurementProjects.length,
      helper: 'No contract evidence',
      className: 'under-procurement',
      title: 'Under Procurement Projects',
      subtitle: 'Projects with 0% physical accomplishment and no contract evidence yet.',
      records: dashboardData.underProcurementProjects,
    },
    {
      key: 'not-started',
      label: 'Not Yet Started',
      value: dashboardData.notStartedProjects.length,
      helper: 'Contracted, 0% physical',
      className: 'not-started',
      title: 'Not Yet Started Projects',
      subtitle: 'Projects with contract evidence but no physical accomplishment yet.',
      records: dashboardData.notStartedProjects,
    },
    {
      key: 'ongoing',
      label: 'Ongoing',
      value: dashboardData.ongoingProjects.length,
      helper: '1% to 99% physical',
      className: 'ongoing',
      title: 'Ongoing Projects',
      subtitle: 'Projects with physical accomplishment above 0% and below 100%, or tagged ongoing.',
      records: dashboardData.ongoingProjects,
    },
    {
      key: 'completed',
      label: 'Completed',
      value: dashboardData.completedProjects.length,
      helper: '100% physical or completed',
      className: 'completed',
      title: 'Completed Projects',
      subtitle: 'Projects with completed status or 100% physical accomplishment.',
      records: dashboardData.completedProjects,
    },
    {
      key: 'critical-status',
      label: 'Critical Status',
      value: dashboardData.criticalStatusProjects.length,
      helper: 'Suspended / terminated / cancelled',
      className: 'critical-status',
      title: 'Critical Status Projects',
      subtitle: 'Projects tagged as suspended, terminated, or cancelled.',
      records: dashboardData.criticalStatusProjects,
    },
    {
      key: 'low-risk',
      label: 'Low Risk',
      value: dashboardData.lowRiskProjects.length,
      helper: 'Risk subset',
      className: 'low-risk',
      title: 'Low Risk Projects',
      subtitle: 'Projects with low risk level.',
      records: dashboardData.lowRiskProjects,
    },
    {
      key: 'medium-risk',
      label: 'Medium Risk',
      value: dashboardData.mediumRiskProjects.length,
      helper: 'Risk subset',
      className: 'medium-risk',
      title: 'Medium Risk Projects',
      subtitle: 'Projects with medium or moderate risk level.',
      records: dashboardData.mediumRiskProjects,
    },
    {
      key: 'high-risk',
      label: 'High Risk',
      value: dashboardData.highRiskProjects.length,
      helper: 'Risk subset',
      className: 'high-risk',
      title: 'High Risk Projects',
      subtitle: 'Projects requiring close monitoring and follow-through.',
      records: dashboardData.highRiskProjects,
    },
  ]

  function renderProjectCard(project: ProjectRecord) {
    const projectId = getProjectId(project)
    const projectName = getProjectName(project)
    const riskLevel = getRiskLevel(project)
    const status = getStatus(project)
    const physicalProgress = formatPercent(getPhysicalProgress(project))

    return (
      <article
        className="dashboard-modal-project-card dashboard-modal-project-row"
        key={projectId || projectName}
      >
        <div className="dashboard-modal-project-main">
          <div className="dashboard-modal-project-info">
            <p className="dashboard-modal-project-kicker">
              {getFundingDisplay(project)}
            </p>

            <h3>{projectName}</h3>

            <p className="dashboard-modal-project-location">
              {getLocation(project)}
            </p>

            <p className="dashboard-modal-project-meta">
              <span>{status}</span>
              <span>Risk: {riskLevel}</span>
              <span>{physicalProgress}</span>
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
      </article>
    )
  }

  function renderModal() {
    if (!drilldown) return null

    const visibleDrilldownProjects = drilldown.projects.slice(0, drilldownVisibleCount)
    const hiddenDrilldownCount = Math.max(
      drilldown.projects.length - visibleDrilldownProjects.length,
      0,
    )

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
              (
                <>
                  {visibleDrilldownProjects.map(renderProjectCard)}

                  {hiddenDrilldownCount > 0 ? (
                    <button
                      type="button"
                      className="dashboard-modal-load-more"
                      onClick={() =>
                        setDrilldownVisibleCount((currentCount) =>
                          currentCount + DRILLDOWN_PAGE_SIZE,
                        )
                      }
                    >
                      Show {Math.min(hiddenDrilldownCount, DRILLDOWN_PAGE_SIZE)} more
                    </button>
                  ) : null}
                </>
              )
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
              completion performance for monitoring.
            </p>
          </div>
        </section>

        <section
          className={[
            'dashboard-filter-panel',
            showDashboardFilters ? 'is-open' : '',
            hasActiveDashboardFilters ? 'has-active-filters' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Dashboard filters"
        >
          <div className="dashboard-filter-bar">
            <div className="dashboard-filter-summary">
              <span className="dashboard-filter-summary-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 6.5h16v2H4v-2Zm3 4.75h10v2H7v-2Zm3 4.75h4v2h-4v-2Z" />
                </svg>
              </span>

              <div className="dashboard-filter-summary-text">
                <p>Dashboard filters</p>
                <strong>
                  {[
                    dashboardFilters.program !== ALL_FILTER_VALUE
                      ? dashboardFilters.program
                      : '',
                    dashboardFilters.year !== ALL_FILTER_VALUE
                      ? dashboardFilters.year
                      : '',
                    dashboardFilters.province !== ALL_FILTER_VALUE
                      ? dashboardFilters.province
                      : '',
                    dashboardFilters.lgu !== ALL_FILTER_VALUE
                      ? dashboardFilters.lgu
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'All projects'}
                </strong>
              </div>
            </div>

            <div className="dashboard-filter-bar-actions">
              <span>
                {formatCount(visibleProjects.length)} / {formatCount(aorProjects.length)}
              </span>

              <button
                type="button"
                className="dashboard-filter-toggle"
                onClick={() => setShowDashboardFilters((current) => !current)}
                aria-expanded={showDashboardFilters}
              >
                {showDashboardFilters ? 'Hide' : 'Filter'}
              </button>
            </div>
          </div>

          <div className="dashboard-filter-grid">
            <label>
              <span>Program</span>
              <select
                value={dashboardFilters.program}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    program: event.target.value,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All programs</option>
                {filterOptions.programs.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Funding Year</span>
              <select
                value={dashboardFilters.year}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    year: event.target.value,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All years</option>
                {filterOptions.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Province</span>
              <select
                value={dashboardFilters.province}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    province: event.target.value,
                    lgu: ALL_FILTER_VALUE,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All provinces</option>
                {filterOptions.provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>LGU</span>
              <select
                value={dashboardFilters.lgu}
                onChange={(event) =>
                  setDashboardFilters((current) => ({
                    ...current,
                    lgu: event.target.value,
                  }))
                }
              >
                <option value={ALL_FILTER_VALUE}>All LGUs</option>
                {filterOptions.lgus.map((lgu) => (
                  <option key={lgu} value={lgu}>
                    {lgu}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="dashboard-filter-reset"
              disabled={!hasActiveDashboardFilters}
              onClick={() => setDashboardFilters(DEFAULT_DASHBOARD_FILTERS)}
            >
              Reset
            </button>
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
                        const selected = visibleProjects.filter((project) => getStatus(project) === name)

                        openDrilldown(
                          `${name} Projects`,
                          `Projects currently categorized as ${name} using the simplified PMS10 status rule.`,
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
                      visibleProjects.filter(
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
                        const selected = visibleProjects.filter(
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
                      visibleProjects.filter(
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

        <section className="dashboard-priority-section dashboard-completion-section">
          <article className="dashboard-list-card dashboard-completion-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Completion Rate</p>
                <h2>Completion Performance</h2>
              </div>

              <span>{dashboardData.completionRate}% complete</span>
            </div>

            <div className="dashboard-completion-grid">
              <div className="dashboard-completion-gauge">
                {dashboardData.totalProjects > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboardData.completionData}
                          dataKey="count"
                          nameKey="name"
                          innerRadius="70%"
                          outerRadius="92%"
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={dashboardData.completionData.length > 1 ? 2 : 0}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const name = safeText(entry?.name, '')
                            const selected =
                              name === 'Completed'
                                ? dashboardData.completedProjects
                                : dashboardData.completionPendingProjects

                            openDrilldown(
                              name === 'Completed'
                                ? 'Completed Projects'
                                : 'Remaining Projects',
                              name === 'Completed'
                                ? 'Projects counted as completed under the current dashboard filter.'
                                : 'Projects not yet counted as completed under the current dashboard filter.',
                              selected,
                            )
                          }}
                        >
                          {dashboardData.completionData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={entry.name === 'Completed' ? '#16a34a' : '#e2e8f0'}
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

                    <div className="dashboard-completion-center" aria-hidden="true">
                      <div>
                        <strong>{dashboardData.completionRate}%</strong>
                        <span>Complete</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="dashboard-empty-state compact">
                    <strong>No completion data</strong>
                    <p>No project records match the current dashboard filters.</p>
                  </div>
                )}
              </div>

              <div className="dashboard-completion-breakdown">
                <button
                  type="button"
                  className="dashboard-completion-breakdown-card"
                  onClick={() =>
                    openDrilldown(
                      'Completed Projects',
                      'Projects counted as completed under the current dashboard filter.',
                      dashboardData.completedProjects,
                    )
                  }
                >
                  <i style={{ backgroundColor: '#16a34a' }} />
                  <span>
                    Completed
                    <strong>100% physical or completed status</strong>
                  </span>
                  <em>{formatCount(dashboardData.completedProjects.length)}</em>
                </button>

                <button
                  type="button"
                  className="dashboard-completion-breakdown-card"
                  onClick={() =>
                    openDrilldown(
                      'Remaining Projects',
                      'Projects not yet counted as completed under the current dashboard filter.',
                      dashboardData.completionPendingProjects,
                    )
                  }
                >
                  <i style={{ backgroundColor: '#94a3b8' }} />
                  <span>
                    Remaining
                    <strong>Procurement, not started, ongoing, or critical status</strong>
                  </span>
                  <em>{formatCount(dashboardData.completionRemainingCount)}</em>
                </button>

                <div className="dashboard-completion-note">
                  <strong>Scope:</strong> This completion rate uses the currently visible
                  dashboard records, so it changes when you filter by program, funding
                  year, province, or LGU.
                </div>
              </div>
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