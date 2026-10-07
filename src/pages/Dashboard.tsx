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

import { useSharedProjects, type SharedProjectRow } from '../lib/projectDataCache'
import { useAuth } from '../context/AuthContext'
import { useDesktopViewport } from '../hooks/useDesktopViewport'
import { readPageView, removePageView, writePageView } from '../lib/pageViewMemory'
import { filterProjectsByAor, type AorProjectLike } from '../utils/aorAccess'
import {
  getPmsPhysicalAccomplishment,
  getPmsProjectStatus,
  getPmsRiskLevel,
} from '../utils/projectStatus'
import { getOfficialProjectCost } from '../utils/projectVariance'
import { isProjectEligibleForAggregatePerformance } from '../utils/projectMetricEligibility'
import { buildProgramFilterOptions, normalizeProgramName } from '../utils/program'
import MultiSelectFilter from '../components/MultiSelectFilter'
import SingleSelectFilter from '../components/SingleSelectFilter'
import { matchesMultiFilter, normalizeMultiFilterValue } from '../utils/multiFilter'
import {
  getCanonicalProjectLgu,
  getCanonicalProjectProvinceOrHuc,
} from '../data/region10Directory'
import '../styles/dashboardDrilldownFilters.css'
import '../styles/dashboardFinancialAccomplishment.css'

import '../styles/filterUniformityV6.css'
import ExecutiveDashboard from '../components/ExecutiveDashboard'
import StartupSplash from '../components/StartupSplash'
import ProvinceStatusChart from '../components/ProvinceStatusChart'
import '../styles/executiveDashboard.css'

type ProjectRecord = SharedProjectRow & AorProjectLike & Record<string, any>

type DrilldownState = {
  title: string
  subtitle: string
  projects: ProjectRecord[]
}

type DrilldownFilters = {
  search: string
  programs: string[]
  years: string[]
  program?: string
  year?: string
  province: string
  lgu: string
}

type DashboardDrilldownMemory = {
  title: string
  subtitle: string
  projectIds: string[]
  visibleCount: number
  scrollTop: number
  filters?: DrilldownFilters
}

type DashboardFilters = {
  programs: string[]
  years: string[]
  program?: string
  year?: string
  province: string
  lgu: string
}

const ALL_FILTER_VALUE = '__ALL__'

const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  programs: [],
  years: [],
  province: ALL_FILTER_VALUE,
  lgu: ALL_FILTER_VALUE,
}

const DEFAULT_DRILLDOWN_FILTERS: DrilldownFilters = {
  search: '',
  programs: [],
  years: [],
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

function truncateDashboardPercent(value: unknown) {
  const clamped = Math.min(100, Math.max(0, asNumber(value)))

  // Tiny epsilon only neutralizes floating-point representation noise.
  // The displayed value is still truncated, never rounded up.
  return Math.trunc((clamped + 1e-9) * 100) / 100
}

function formatPhysicalPercent(value: unknown) {
  return `${truncateDashboardPercent(value).toFixed(2)}%`
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


function getDashboardRiskClass(riskLevel: unknown) {
  const risk = normalizeForCompare(riskLevel)

  if (!risk || risk.includes('none') || risk.includes('no risk')) return 'none'
  if (risk.includes('high') || risk.includes('critical')) return 'high'
  if (risk.includes('moderate') || risk.includes('medium')) return 'moderate'
  if (risk.includes('low')) return 'low'

  return 'none'
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
  const province = project.province ?? project.province_name
  const lgu =
    project.city_municipality ??
    project.municipality ??
    project.city ??
    project.lgu ??
    project.lgu_name

  return getCanonicalProjectProvinceOrHuc(province, lgu)
}

function getLguFilterValue(project: ProjectRecord) {
  const province = project.province ?? project.province_name
  const lgu =
    project.city_municipality ??
    project.municipality ??
    project.city ??
    project.lgu ??
    project.lgu_name

  return getCanonicalProjectLgu(province, lgu)
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
  return clampDashboardPercent(getPmsPhysicalAccomplishment(project))
}

function clampDashboardPercent(value: unknown) {
  return Math.min(100, Math.max(0, asNumber(value)))
}

function getFinancialProgress(project: ProjectRecord) {
  return clampDashboardPercent(
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

function getStatusColor(status: unknown, fallbackIndex = 0) {
  const normalized = normalizeForCompare(status)

  // Keep Detailed View status colors consistent with Executive View.
  if (normalized.includes('complete') || normalized.includes('finished')) {
    return '#16a34a'
  }

  if (normalized.includes('suspend') || normalized.includes('cancel')) {
    return '#ef4444'
  }

  if (normalized.includes('terminate')) {
    return '#991b1b'
  }

  if (
    normalized.includes('not yet started') ||
    normalized.includes('not started') ||
    normalized.includes('no implementation')
  ) {
    return '#64748b'
  }

  if (
    normalized.includes('under procurement') ||
    normalized.includes('procurement') ||
    normalized.includes('bid evaluation') ||
    normalized.includes('bid opening')
  ) {
    return '#f97316'
  }

  if (normalized.includes('ongoing') || normalized.includes('progress')) {
    return '#2563eb'
  }

  return CHART_COLORS[fallbackIndex % CHART_COLORS.length]
}


function projectMatchesDesktopStatus(project: ProjectRecord, statusName: string) {
  const status = getStatus(project)

  if (statusName === 'Suspended / Cancelled') {
    return status === 'Suspended' || status === 'Cancelled'
  }

  return status === statusName
}

type DetailedHighRiskReasonKey = 'expired' | 'critical-status' | 'slippage'

function detailedRiskNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(String(value).replace(/,/g, '').replace(/%/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function detailedProjectIsComplete(project: ProjectRecord) {
  const status = getStatus(project)
  return status === 'Completed' || getPhysicalProgress(project) >= 100
}

function detailedProjectSlippage(project: ProjectRecord) {
  const importedCandidates = [
    project.slippage,
    project.variance,
    project.physical_variance,
    project.schedule_variance,
  ]

  for (const candidate of importedCandidates) {
    const parsed = detailedRiskNumber(candidate)
    if (parsed !== null) return parsed
  }

  const target = detailedRiskNumber(
    project.target_physical_accomplishment ??
      project.target_physical ??
      project.planned_physical_accomplishment,
  )

  if (target === null) return null
  return getPhysicalProgress(project) - target
}

function detailedContractDeadline(project: ProjectRecord) {
  const candidates = [
    project.revised_completion_date,
    project.extended_completion_date,
    project.contract_completion_date,
    project.contract_expiry_date,
  ]

  for (const candidate of candidates) {
    const text = safeText(candidate, '')
    if (!text) continue

    const date = new Date(text)
    if (!Number.isNaN(date.getTime())) return date
  }

  return null
}

function getDetailedHighRiskReasons(
  project: ProjectRecord,
  referenceDate = new Date(),
): DetailedHighRiskReasonKey[] {
  if (detailedProjectIsComplete(project)) return []

  const reasons: DetailedHighRiskReasonKey[] = []
  const status = getStatus(project)

  if (status === 'Suspended' || status === 'Cancelled') {
    reasons.push('critical-status')
  }

  const slippage = detailedProjectSlippage(project)
  if (slippage !== null && slippage <= -15) {
    reasons.push('slippage')
  }

  const deadline = detailedContractDeadline(project)
  if (deadline) {
    const deadlineEnd = new Date(deadline)
    deadlineEnd.setHours(23, 59, 59, 999)

    if (deadlineEnd.getTime() < referenceDate.getTime()) {
      reasons.push('expired')
    }
  }

  return reasons
}

function getRiskColor(riskLevel: unknown, fallbackIndex = 0) {
  const risk = normalizeForCompare(riskLevel)

  if (risk.includes('high') || risk.includes('critical')) return '#ef4444'
  if (risk.includes('moderate') || risk.includes('medium')) return '#f97316'
  if (risk.includes('low')) return '#eab308'
  if (risk.includes('none') || risk.includes('no risk')) return '#16a34a'

  return CHART_COLORS[fallbackIndex % CHART_COLORS.length]
}

function FilterSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="5.75" />
      <path d="m15 15 4.25 4.25" />
    </svg>
  )
}

// PMS10_EXECUTIVE_DASHBOARD_V2
function canUseExecutiveDashboard(auth: any) {
  if (
    Boolean(auth?.isAdmin) ||
    Boolean(auth?.isViewer) ||
    Boolean(auth?.isROEngineer) ||
    Boolean(auth?.isPOEngineer) ||
    Boolean(auth?.isEngineer)
  ) {
    return true
  }

  const role = String(
    auth?.profile?.role ?? auth?.user?.user_metadata?.role ?? '',
  )
    .trim()
    .toLowerCase()

  return new Set([
    'admin',
    'viewer',
    'rd',
    'regional director',
    'ard',
    'assistant regional director',
    'pd',
    'provincial director',
    'cd',
    'city director',
    'mlgoo',
    'clgoo',
    'peo',
    'project evaluation officer',
    'ch',
    'chief',
    'pdmu chief',
    'pdmu chief/head',
    'pdmu head',
    'ro engineer',
    'ro engineers',
    'po engineer',
    'po engineers',
    'engineer',
  ]).has(role)
}

export default function Dashboard() {
  const executiveAuth = useAuth()
  const hasExecutiveDashboard = canUseExecutiveDashboard(executiveAuth)
  const initialDashboardView: 'executive' | 'detailed' =
    new URLSearchParams(window.location.search).get('view') === 'detailed'
      ? 'detailed'
      : 'executive'

  const [dashboardView, setDashboardView] = useState<'executive' | 'detailed'>(
    initialDashboardView,
  )
  const [viewTransitionPhase, setViewTransitionPhase] = useState<'idle' | 'leaving' | 'entering'>('idle')
  const [viewTransitionDirection, setViewTransitionDirection] = useState<'forward' | 'backward'>('forward')

  const switchDashboardView = (nextView: 'executive' | 'detailed') => {
    if (nextView === dashboardView || viewTransitionPhase !== 'idle') return

    setViewTransitionDirection(nextView === 'detailed' ? 'forward' : 'backward')
    setViewTransitionPhase('leaving')

    // One obvious page slide, but transform-only for smooth GPU rendering.
    // Timings intentionally match the CSS animations below.
    window.setTimeout(() => {
      setDashboardView(nextView)
      setViewTransitionPhase('entering')

      window.setTimeout(() => {
        setViewTransitionPhase('idle')
      }, 520)
    }, 420)
  }

  const visualDashboardView: 'executive' | 'detailed' =
    viewTransitionPhase === 'idle'
      ? dashboardView
      : viewTransitionDirection === 'forward'
        ? 'detailed'
        : 'executive'

  useEffect(() => {
    window.localStorage.setItem('pms10:dashboard-view', visualDashboardView)
    window.dispatchEvent(
      new CustomEvent('pms10:dashboard-view-state', {
        detail: { view: visualDashboardView },
      }),
    )
  }, [visualDashboardView])

  useEffect(() => {
    const handleFloatingViewRequest = (event: Event) => {
      const nextView = (
        event as CustomEvent<{ view?: 'executive' | 'detailed' }>
      ).detail?.view

      if (nextView !== 'executive' && nextView !== 'detailed') return

      switchDashboardView(nextView)
    }

    window.addEventListener(
      'pms10:dashboard-view-request',
      handleFloatingViewRequest as EventListener,
    )

    return () => {
      window.removeEventListener(
        'pms10:dashboard-view-request',
        handleFloatingViewRequest as EventListener,
      )
    }
  }, [dashboardView, viewTransitionPhase])

  /*
    PMS10 dashboard entry behavior:
    - Direct website/dashboard opening: Executive View by default.
    - Dashboard workspace button from Projects/Map/Reports/etc.: Detailed View.
    - Executive/Detailed switch remains available while on Dashboard.
    - The temporary navigation query is consumed after entry.
  */

  const isDesktopViewport = useDesktopViewport()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedView = params.get('view')

    if (requestedView !== 'executive' && requestedView !== 'detailed') return

    params.delete('view')
    const nextSearch = params.toString()

    navigate(
      {
        pathname: '/dashboard',
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }, [navigate])

  const auth = useAuth()
  const modalCloseTimerRef = useRef<number | null>(null)
  const modalBodyRef = useRef<HTMLDivElement | null>(null)
  const rememberedDrilldownRef = useRef(
    readPageView<DashboardDrilldownMemory | null>('dashboard:drilldown', null),
  )
  const drilldownScrollTopRef = useRef(rememberedDrilldownRef.current?.scrollTop || 0)
  const rememberedView = readPageView('dashboard', {
    filters: DEFAULT_DASHBOARD_FILTERS,
    showFilters: false,
  })

  const {
    projects,
    loading,
    errorMessage,
    refreshProjects,
  } = useSharedProjects<ProjectRecord>()
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null)
  const [isDrilldownClosing, setIsDrilldownClosing] = useState(false)
  const [drilldownVisibleCount, setDrilldownVisibleCount] = useState(
    rememberedDrilldownRef.current?.visibleCount || DRILLDOWN_PAGE_SIZE,
  )
  const rememberedDrilldownFilters = rememberedDrilldownRef.current?.filters as
    | (Partial<DrilldownFilters> & { program?: unknown; year?: unknown })
    | undefined
  const [drilldownFilters, setDrilldownFilters] = useState<DrilldownFilters>({
    ...DEFAULT_DRILLDOWN_FILTERS,
    ...(rememberedDrilldownFilters || {}),
    programs: normalizeMultiFilterValue(
      rememberedDrilldownFilters?.programs ?? rememberedDrilldownFilters?.program,
    ),
    years: normalizeMultiFilterValue(
      rememberedDrilldownFilters?.years ?? rememberedDrilldownFilters?.year,
    ),
  })
  const [showDrilldownFilters, setShowDrilldownFilters] = useState(false)
  /* PMS10_MOBILE_DRILLDOWN_DEFAULT_COLLAPSED_V10 */
  useEffect(() => {
    if (drilldown) {
      setShowDrilldownFilters(false)
    }
  }, [drilldown])
  const [isDashboardScrolled, setIsDashboardScrolled] = useState(false)
  const rememberedDashboardFilters = (rememberedView.filters || {}) as
    Partial<DashboardFilters> & { program?: unknown; year?: unknown }
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({
    ...DEFAULT_DASHBOARD_FILTERS,
    ...rememberedDashboardFilters,
    programs: normalizeMultiFilterValue(
      rememberedDashboardFilters.programs ?? rememberedDashboardFilters.program,
    ),
    years: normalizeMultiFilterValue(
      rememberedDashboardFilters.years ?? rememberedDashboardFilters.year,
    ),
  })
  const [showDashboardFilters, setShowDashboardFilters] = useState(false)

  useEffect(() => {
    writePageView('dashboard', {
      filters: dashboardFilters,
      showFilters: showDashboardFilters,
    })
  }, [dashboardFilters, showDashboardFilters])

  useEffect(() => {
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

  function openDrilldown(
    title: string,
    subtitle: string,
    selectedProjects: ProjectRecord[],
  ) {
    if (modalCloseTimerRef.current) {
      window.clearTimeout(modalCloseTimerRef.current)
    }

    const memory: DashboardDrilldownMemory = {
      title,
      subtitle,
      projectIds: selectedProjects.map((project) => project.id),
      visibleCount: DRILLDOWN_PAGE_SIZE,
      scrollTop: 0,
      filters: DEFAULT_DRILLDOWN_FILTERS,
    }

    rememberedDrilldownRef.current = memory
    drilldownScrollTopRef.current = 0
    writePageView('dashboard:drilldown', memory)

    setIsDrilldownClosing(false)
    setShowDrilldownFilters(false)
    setDrilldownFilters(DEFAULT_DRILLDOWN_FILTERS)
    setDrilldownVisibleCount(DRILLDOWN_PAGE_SIZE)
    setDrilldown({
      title,
      subtitle,
      projects: selectedProjects,
    })
  }

  function closeDrilldown() {
    if (!drilldown || isDrilldownClosing) return

    setShowDrilldownFilters(false)
    setIsDrilldownClosing(true)
    rememberedDrilldownRef.current = null
    drilldownScrollTopRef.current = 0
    removePageView('dashboard:drilldown')

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
    const provinceFilteredProjects = aorProjects.filter((project) =>
      dashboardFilters.province === ALL_FILTER_VALUE
        ? true
        : getProvinceFilterValue(project) === dashboardFilters.province,
    )

    return {
      programs: buildProgramFilterOptions(aorProjects.map(getProgramFilterValue), false),
      years,
      provinces: uniqueSortedTextValues(aorProjects.map(getProvinceFilterValue)),
      lgus: uniqueSortedTextValues(provinceFilteredProjects.map(getLguFilterValue)),
    }
  }, [aorProjects, dashboardFilters.province])

  const hasActiveDashboardFilters = useMemo(() => {
    return (
      dashboardFilters.programs.length > 0 ||
      dashboardFilters.years.length > 0 ||
      dashboardFilters.province !== ALL_FILTER_VALUE ||
      dashboardFilters.lgu !== ALL_FILTER_VALUE
    )
  }, [dashboardFilters])

  const visibleProjects = useMemo(() => {
    return aorProjects.filter((project) => {
      return (
        matchesMultiFilter(
          getProgramFilterValue(project),
          dashboardFilters.programs,
        ) &&
        matchesMultiFilter(getYearFilterValue(project), dashboardFilters.years) &&
        matchesDashboardFilter(
          getProvinceFilterValue(project),
          dashboardFilters.province,
        ) &&
        matchesDashboardFilter(getLguFilterValue(project), dashboardFilters.lgu)
      )
    })
  }, [aorProjects, dashboardFilters])

  useEffect(() => {
    const remembered = rememberedDrilldownRef.current
    if (!remembered || drilldown || loading) return

    const byId = new Map(visibleProjects.map((project) => [project.id, project]))
    const restoredProjects = remembered.projectIds
      .map((projectId) => byId.get(projectId))
      .filter((project): project is ProjectRecord => Boolean(project))

    if (remembered.projectIds.length > 0 && restoredProjects.length === 0) return

    setDrilldownVisibleCount(
      Math.max(DRILLDOWN_PAGE_SIZE, Number(remembered.visibleCount) || DRILLDOWN_PAGE_SIZE),
    )
    setDrilldownFilters({
      ...DEFAULT_DRILLDOWN_FILTERS,
      ...(remembered.filters || {}),
    })
    setDrilldown({
      title: remembered.title,
      subtitle: remembered.subtitle,
      projects: restoredProjects,
    })
  }, [drilldown, loading, visibleProjects])

  useEffect(() => {
    if (!drilldown) return

    const projectIds = drilldown.projects.map((project) => project.id)
    const memory: DashboardDrilldownMemory = {
      title: drilldown.title,
      subtitle: drilldown.subtitle,
      projectIds,
      visibleCount: drilldownVisibleCount,
      scrollTop: drilldownScrollTopRef.current,
      filters: drilldownFilters,
    }

    rememberedDrilldownRef.current = memory
    writePageView('dashboard:drilldown', memory)

    const frame = window.requestAnimationFrame(() => {
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTop = drilldownScrollTopRef.current
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [drilldown, drilldownVisibleCount, drilldownFilters])

  const dashboardData = useMemo(() => {
    const performanceProjects = visibleProjects.filter(
      isProjectEligibleForAggregatePerformance,
    )

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
        ? truncateDashboardPercent(
            (completedProjects.length / visibleProjects.length) * 100,
          )
        : 0

    const physicalWeightBase = performanceProjects.reduce(
      (sum, project) =>
        sum +
        Math.max(
          0,
          getOfficialProjectCost(
            project as unknown as Parameters<typeof getOfficialProjectCost>[0],
          ),
        ),
      0,
    )

    const weightedPhysicalAccomplishment = performanceProjects.reduce(
      (sum, project) => {
        const cost = Math.max(
          0,
          getOfficialProjectCost(
            project as unknown as Parameters<typeof getOfficialProjectCost>[0],
          ),
        )

        return sum + cost * (getPhysicalProgress(project) / 100)
      },
      0,
    )

    const physicalAccomplishment = truncateDashboardPercent(
      physicalWeightBase > 0
        ? (weightedPhysicalAccomplishment / physicalWeightBase) * 100
        : 0,
    )

    const physicalAccomplishmentMethod =
      physicalWeightBase > 0
        ? 'Cost-weighted across eligible project costs'
        : 'No eligible project cost available'

    const financialWeightBase = performanceProjects.reduce(
      (sum, project) => sum + Math.max(0, getOfficialProjectCost(project as unknown as Parameters<typeof getOfficialProjectCost>[0])),
      0,
    )

    const weightedFinancialAccomplishment = performanceProjects.reduce(
      (sum, project) => {
        const cost = Math.max(0, getOfficialProjectCost(project as unknown as Parameters<typeof getOfficialProjectCost>[0]))

        return sum + cost * (getFinancialProgress(project) / 100)
      },
      0,
    )

    const financialAccomplishment =
      financialWeightBase > 0
        ? (weightedFinancialAccomplishment / financialWeightBase) * 100
        : 0

    const financialAccomplishmentMethod =
      financialWeightBase > 0
        ? 'Cost-weighted across eligible project costs'
        : 'No eligible project cost available'

    const physicalPerformanceData = [
      {
        name: 'Physical Accomplishment',
        value: physicalAccomplishment,
      },
      {
        name: 'Remaining',
        value: Math.max(0, 100 - physicalAccomplishment),
      },
    ]

    const financialPerformanceData = [
      {
        name: 'Financial Accomplishment',
        value: financialAccomplishment,
      },
      {
        name: 'Remaining',
        value: Math.max(0, 100 - financialAccomplishment),
      },
    ]

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

    const riskExposureData = [
      { name: 'High Risk', count: highRiskProjects.length },
      {
        name: 'Other Projects',
        count: Math.max(visibleProjects.length - highRiskProjects.length, 0),
      },
    ].filter((item) => item.count > 0)


    const desktopStatusData = [
      { name: 'Completed', count: completedProjects.length },
      { name: 'Under Procurement', count: underProcurementProjects.length },
      { name: 'Ongoing', count: ongoingProjects.length },
      { name: 'Not Yet Started', count: notStartedProjects.length },
      {
        name: 'Suspended / Cancelled',
        count: suspendedProjects.length + cancelledProjects.length,
      },
      { name: 'Terminated', count: terminatedProjects.length },
    ].filter((item) => item.count > 0)

    const highRiskReasonData = [
      {
        key: 'expired' as const,
        name: 'Expired Contract',
        count: highRiskProjects.filter((project) =>
          getDetailedHighRiskReasons(project).includes('expired'),
        ).length,
      },
      {
        key: 'critical-status' as const,
        name: 'Suspended / Cancelled',
        count: highRiskProjects.filter((project) =>
          getDetailedHighRiskReasons(project).includes('critical-status'),
        ).length,
      },
      {
        key: 'slippage' as const,
        name: 'Negative Slippage ≥ 15%',
        count: highRiskProjects.filter((project) =>
          getDetailedHighRiskReasons(project).includes('slippage'),
        ).length,
      },
    ]

    const latestProjects = [...visibleProjects]
      .sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a))
      .slice(0, 5)

    return {
      provinceStatusProjects: visibleProjects.map((project) => ({
        area: getProvinceFilterValue(project) || 'Unassigned',
        status: getStatus(project),
      })),
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
      physicalAccomplishment,
      physicalAccomplishmentMethod,
      financialAccomplishment,
      financialAccomplishmentMethod,
      physicalPerformanceData,
      financialPerformanceData,
      completionData,
      statusData,
      desktopStatusData,
      riskData,
      riskExposureData,
      highRiskReasonData,
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

  const desktopStatCards = [
    {
      key: 'total',
      label: 'Total Projects',
      value: dashboardData.totalProjects,
      displayValue: formatCount(dashboardData.totalProjects),
      helper: 'Projects in current scope',
      className: 'total desktop-summary',
      title: 'All Projects',
      subtitle: 'Complete list of projects in the current dashboard scope.',
      records: visibleProjects,
    },
    {
      key: 'physical',
      label: 'Physical Accomplishment',
      value: dashboardData.physicalAccomplishment,
      displayValue: formatPhysicalPercent(dashboardData.physicalAccomplishment),
      helper: 'Cost-weighted performance',
      className: 'physical-summary desktop-summary',
      title: 'Physical Accomplishment Scope',
      subtitle: 'Projects contributing to the current physical accomplishment view.',
      records: visibleProjects,
    },
    {
      key: 'financial',
      label: 'Financial Accomplishment',
      value: dashboardData.financialAccomplishment,
      displayValue: formatPercent(dashboardData.financialAccomplishment),
      helper: 'Cost-weighted performance',
      className: 'financial-summary desktop-summary',
      title: 'Financial Accomplishment Scope',
      subtitle: 'Projects contributing to the current financial accomplishment view.',
      records: visibleProjects,
    },
    {
      key: 'high-risk',
      label: 'High Risk',
      value: dashboardData.highRiskProjects.length,
      displayValue: formatCount(dashboardData.highRiskProjects.length),
      helper: 'Requires close monitoring',
      className: 'high-risk desktop-summary',
      title: 'High Risk Projects',
      subtitle: 'Projects currently classified as High Risk.',
      records: dashboardData.highRiskProjects,
    },
  ]

  const drilldownFilterOptions = useMemo(() => {
    const sourceProjects = drilldown?.projects || []
    const provinceProjects = sourceProjects.filter((project) =>
      drilldownFilters.province === ALL_FILTER_VALUE
        ? true
        : getProvinceFilterValue(project) === drilldownFilters.province,
    )

    return {
      programs: buildProgramFilterOptions(
        sourceProjects.map(getProgramFilterValue),
        false,
      ),
      years: uniqueSortedTextValues(sourceProjects.map(getYearFilterValue)).sort(
        (a, b) => asNumber(b) - asNumber(a),
      ),
      provinces: uniqueSortedTextValues(sourceProjects.map(getProvinceFilterValue)),
      lgus: uniqueSortedTextValues(provinceProjects.map(getLguFilterValue)),
    }
  }, [drilldown, drilldownFilters.province])

  const filteredDrilldownProjects = useMemo(() => {
    if (!drilldown) return []

    const search = normalizeForCompare(drilldownFilters.search)

    return drilldown.projects.filter((project) => {
      const searchableText = normalizeForCompare(
        [
          getProjectName(project),
          getLocation(project),
          getFundingDisplay(project),
          getStatus(project),
          getRiskLevel(project),
        ].join(' '),
      )

      return (
        (!search || searchableText.includes(search)) &&
        matchesMultiFilter(
          getProgramFilterValue(project),
          drilldownFilters.programs,
        ) &&
        matchesMultiFilter(getYearFilterValue(project), drilldownFilters.years) &&
        matchesDashboardFilter(
          getProvinceFilterValue(project),
          drilldownFilters.province,
        ) &&
        matchesDashboardFilter(getLguFilterValue(project), drilldownFilters.lgu)
      )
    })
  }, [drilldown, drilldownFilters])

  const hasActiveDrilldownFilters = useMemo(() => {
    return (
      drilldownFilters.search.trim().length > 0 ||
      drilldownFilters.programs.length > 0 ||
      drilldownFilters.years.length > 0 ||
      drilldownFilters.province !== ALL_FILTER_VALUE ||
      drilldownFilters.lgu !== ALL_FILTER_VALUE
    )
  }, [drilldownFilters])

  function updateDrilldownFilters(next: Partial<DrilldownFilters>) {
    setDrilldownFilters((current) => ({ ...current, ...next }))
    setDrilldownVisibleCount(DRILLDOWN_PAGE_SIZE)
    drilldownScrollTopRef.current = 0

    window.requestAnimationFrame(() => {
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0
    })
  }

  function clearDrilldownFilters() {
    setDrilldownFilters(DEFAULT_DRILLDOWN_FILTERS)
    setDrilldownVisibleCount(DRILLDOWN_PAGE_SIZE)
    drilldownScrollTopRef.current = 0

    window.requestAnimationFrame(() => {
      if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0
    })
  }

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
              <span className={`dashboard-modal-risk ${getDashboardRiskClass(riskLevel)}`}>Risk: {riskLevel}</span>
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

    const visibleDrilldownProjects = filteredDrilldownProjects.slice(
      0,
      drilldownVisibleCount,
    )
    const hiddenDrilldownCount = Math.max(
      filteredDrilldownProjects.length - visibleDrilldownProjects.length,
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
                {drilldown.subtitle}{' '}
                {hasActiveDrilldownFilters
                  ? `Showing ${formatCount(filteredDrilldownProjects.length)} of ${formatCount(drilldown.projects.length)} records.`
                  : `Showing ${formatCount(drilldown.projects.length)} record${drilldown.projects.length === 1 ? '' : 's'}.`}
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

          <div
            className={`dashboard-drilldown-filter-shell ${
              showDrilldownFilters ? 'is-open' : 'is-collapsed'
            }`}
          >
            <div className="dashboard-drilldown-filter-heading">
              <div className="dashboard-drilldown-filter-heading-copy">
                <span className="dashboard-drilldown-filter-title">Filters</span>
                <span className="dashboard-drilldown-filter-status">
                  {hasActiveDrilldownFilters
                    ? `${formatCount(filteredDrilldownProjects.length)} of ${formatCount(drilldown.projects.length)} projects`
                    : `${formatCount(drilldown.projects.length)} projects`}
                </span>
              </div>

              <button
                type="button"
                className="dashboard-drilldown-filter-toggle"
                onClick={() => setShowDrilldownFilters((current) => !current)}
                aria-expanded={showDrilldownFilters}
                aria-controls="dashboard-drilldown-filter-fields"
              >
                <span>{showDrilldownFilters ? 'Hide' : 'Filter'}</span>
                <span
                  className={`dashboard-drilldown-filter-toggle-icon ${
                    showDrilldownFilters ? 'is-open' : ''
                  }`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>
            </div>

            {showDrilldownFilters ? (
              <div
                id="dashboard-drilldown-filter-fields"
                className="dashboard-drilldown-filterbar"
                aria-label="Drilldown filters"
              >
            <label className="dashboard-drilldown-search">
              <span>Search</span>
              <div className="pms-drilldown-search-control">
                <FilterSearchIcon />
                <input
                  type="search"
                  value={drilldownFilters.search}
                  placeholder="Search project or location"
                  onChange={(event) =>
                    updateDrilldownFilters({ search: event.target.value })
                  }
                />
              </div>
            </label>

            <MultiSelectFilter
              label="Program"
              options={drilldownFilterOptions.programs}
              values={drilldownFilters.programs}
              onChange={(programs) => updateDrilldownFilters({ programs })}
              allLabel="All Programs"
            />

            <MultiSelectFilter
              label="FY"
              options={drilldownFilterOptions.years}
              values={drilldownFilters.years}
              onChange={(years) => updateDrilldownFilters({ years })}
              allLabel="All FY"
            />

            <SingleSelectFilter
              label="Province/HUC"
              value={drilldownFilters.province}
              options={[
                {
                  value: ALL_FILTER_VALUE,
                  label: 'All Provinces/HUCs',
                },
                ...drilldownFilterOptions.provinces.map((province) => ({
                  value: province,
                  label: province,
                })),
              ]}
              onChange={(value) =>
                updateDrilldownFilters({
                  province: value,
                  lgu: ALL_FILTER_VALUE,
                })
              }
            />

            <SingleSelectFilter
              label="LGU"
              value={drilldownFilters.lgu}
              options={[
                { value: ALL_FILTER_VALUE, label: 'All LGUs' },
                ...drilldownFilterOptions.lgus.map((lgu) => ({
                  value: lgu,
                  label: lgu,
                })),
              ]}
              onChange={(value) =>
                updateDrilldownFilters({ lgu: value })
              }
            />

            <button
              type="button"
              className="dashboard-drilldown-filter-reset"
              disabled={!hasActiveDrilldownFilters}
              onClick={clearDrilldownFilters}
            >
              Reset
            </button>
              </div>
            ) : null}
          </div>

          <div
            className="dashboard-modal-body"
            ref={modalBodyRef}
            onScroll={(event) => {
              const scrollTop = event.currentTarget.scrollTop
              drilldownScrollTopRef.current = scrollTop

              if (drilldown) {
                const memory: DashboardDrilldownMemory = {
                  title: drilldown.title,
                  subtitle: drilldown.subtitle,
                  projectIds: drilldown.projects.map((project) => project.id),
                  visibleCount: drilldownVisibleCount,
                  scrollTop,
                  filters: drilldownFilters,
                }
                rememberedDrilldownRef.current = memory
                writePageView('dashboard:drilldown', memory)
              }
            }}
          >
            {filteredDrilldownProjects.length > 0 ? (
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
                <p>There are no records matching the current drilldown filters.</p>
              </div>
            )}
          </div>
        </section>
      </div>,
      document.body,
    )
  }

  if (loading) {
    return <StartupSplash message="Loading dashboard…" />
  }

  if (errorMessage) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-error-card">
          <p className="dashboard-eyebrow">Dashboard Error</p>
          <h2>Unable to load dashboard records</h2>
          <p>{errorMessage}</p>

          <button type="button" onClick={() => void refreshProjects()}>
            Try Again
          </button>
        </div>
      </main>
    )
  }

  if (hasExecutiveDashboard && isDesktopViewport && dashboardView === 'executive') {
    return (
      <>
        <div className={`pms-dashboard-view-stage is-executive ${viewTransitionPhase} ${viewTransitionDirection}`}>
          <ExecutiveDashboard
            projects={aorProjects}
            onOpenDetailed={() => switchDashboardView('detailed')}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <div className={`pms-dashboard-view-stage is-detailed ${viewTransitionPhase} ${viewTransitionDirection}`}>
      <>
      <main
        className={`dashboard-page ${
          isDashboardScrolled ? 'is-dashboard-scrolled' : ''
        }`}
      >
        {!isDesktopViewport && (
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
        )}

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
                    dashboardFilters.programs.length
                      ? `Programs: ${dashboardFilters.programs.join(', ')}`
                      : '',
                    dashboardFilters.years.length
                      ? `Funding Years: ${dashboardFilters.years.join(', ')}`
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
            <MultiSelectFilter
              label="Program"
              options={filterOptions.programs}
              values={dashboardFilters.programs}
              onChange={(programs) =>
                setDashboardFilters((current) => ({ ...current, programs }))
              }
              allLabel="All Programs"
            />

            <MultiSelectFilter
              label="Funding Year"
              options={filterOptions.years}
              values={dashboardFilters.years}
              onChange={(years) =>
                setDashboardFilters((current) => ({ ...current, years }))
              }
              allLabel="All Funding Years"
            />

            <SingleSelectFilter
              label="Province/HUC"
              value={dashboardFilters.province}
              options={[
                {
                  value: ALL_FILTER_VALUE,
                  label: 'All Provinces/HUCs',
                },
                ...filterOptions.provinces.map((province) => ({
                  value: province,
                  label: province,
                })),
              ]}
              onChange={(value) =>
                setDashboardFilters((current) => ({
                  ...current,
                  province: value,
                  lgu: ALL_FILTER_VALUE,
                }))
              }
            />

            <SingleSelectFilter
              label="LGU"
              value={dashboardFilters.lgu}
              options={[
                { value: ALL_FILTER_VALUE, label: 'All LGUs' },
                ...filterOptions.lgus.map((lgu) => ({
                  value: lgu,
                  label: lgu,
                })),
              ]}
              onChange={(value) =>
                setDashboardFilters((current) => ({
                  ...current,
                  lgu: value,
                }))
              }
            />

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
          {(isDesktopViewport ? desktopStatCards : statCards).map((card) => (
            <button
              type="button"
              key={card.key}
              className={`dashboard-stat-card ${card.className}`}
              onClick={() =>
                openDrilldown(card.title, card.subtitle, card.records)
              }
            >
              <span>{card.label}</span>
              <strong>
                {'displayValue' in card
                  ? String(card.displayValue)
                  : formatCount(card.value)}
              </strong>
              <small>{card.helper}</small>
            </button>
          ))}
        </section>

        <section className="dashboard-main-grid dashboard-chart-row">
          <article className="dashboard-chart-card dashboard-status-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Status</p>
                <h2>{isDesktopViewport ? 'Portfolio Status' : 'Projects by Status'}</h2>
              </div>

              <span>{formatCount(dashboardData.totalProjects)} total</span>
            </div>

            {isDesktopViewport ? (
              <>
                <div
                  className="dashboard-chart-area dashboard-status-pie-area"
                  aria-label="Portfolio status pie chart"
                >
                  {dashboardData.desktopStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboardData.desktopStatusData}
                          dataKey="count"
                          nameKey="name"
                          innerRadius={0}
                          outerRadius="82%"
                          paddingAngle={1}
                          stroke="#ffffff"
                          strokeWidth={2}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const name = safeText(entry?.name, '')
                            const selected = visibleProjects.filter((project) =>
                              projectMatchesDesktopStatus(project, name),
                            )

                            openDrilldown(
                              `${name} Projects`,
                              `Projects currently categorized as ${name}.`,
                              selected,
                            )
                          }}
                        >
                          {dashboardData.desktopStatusData.map((entry, index) => (
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

                <div className="dashboard-legend-list dashboard-status-legend">
                  {dashboardData.desktopStatusData.map((item, index) => (
                    <button
                      type="button"
                      key={item.name}
                      onClick={() =>
                        openDrilldown(
                          `${item.name} Projects`,
                          `Projects currently categorized as ${item.name}.`,
                          visibleProjects.filter((project) =>
                            projectMatchesDesktopStatus(project, item.name),
                          ),
                        )
                      }
                    >
                      <i
                        style={{
                          backgroundColor: getStatusColor(item.name, index),
                        }}
                      />
                      <span>{item.name}</span>
                      <strong>{formatCount(item.count)}</strong>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="dashboard-chart-area">
                  {dashboardData.statusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboardData.statusData}
                          dataKey="count"
                          nameKey="name"
                          innerRadius="56%"
                          outerRadius="84%"
                          paddingAngle={2}
                          cursor="pointer"
                          onClick={(entry: any) => {
                            const name = safeText(entry?.name, '')
                            const selected = visibleProjects.filter(
                              (project) => getStatus(project) === name,
                            )

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
              </>
            )}
          </article>

          <article className="dashboard-chart-card dashboard-performance-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">
                  {isDesktopViewport ? 'Geographic Overview' : 'Risk'}
                </p>
                <h2>
                  {isDesktopViewport
                    ? 'Project Status by Province / HUC'
                    : 'Projects by Risk Level'}
                </h2>
              </div>

              <span>
                {isDesktopViewport
                  ? `${formatCount(visibleProjects.length)} projects`
                  : `${formatCount(dashboardData.highRiskProjects.length)} high`}
              </span>
            </div>

            {isDesktopViewport ? (
              <ProvinceStatusChart projects={dashboardData.provinceStatusProjects} />
            ) : (
              <>
                <div className="dashboard-chart-area">
                  {dashboardData.riskData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboardData.riskData}
                          dataKey="count"
                          nameKey="name"
                          innerRadius="56%"
                          outerRadius="84%"
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
              </>
            )}
          </article>
        </section>

        {!isDesktopViewport ? (
        <section className="dashboard-priority-section dashboard-completion-section">
          <article className="dashboard-list-card dashboard-completion-card">
            <div className="dashboard-card-header">
              <div>
                <p className="dashboard-card-kicker">Overall Accomplishment</p>
                <h2>Physical & Financial Performance</h2>
              </div>

              <span className="dashboard-completion-rate-pill">
                {formatPhysicalPercent(dashboardData.physicalAccomplishment)} physical
              </span>

              <div
                className="dashboard-performance-summary-pill"
                aria-label={`Physical accomplishment ${formatPhysicalPercent(dashboardData.physicalAccomplishment)}; financial accomplishment ${formatPercent(dashboardData.financialAccomplishment)}`}
              >
                <span className="dashboard-performance-summary-item is-physical">
                  <strong>{formatPhysicalPercent(dashboardData.physicalAccomplishment)}</strong>
                  <em>Physical</em>
                </span>
                <i aria-hidden="true" />
                <span className="dashboard-performance-summary-item is-financial">
                  <strong>{formatPercent(dashboardData.financialAccomplishment)}</strong>
                  <em>Financial</em>
                </span>
              </div>
            </div>

            <div className="dashboard-completion-grid">
              <div className="dashboard-performance-gauges">
                <div className="dashboard-performance-gauge-wrap">
                  <p className="dashboard-performance-gauge-label">
                    Physical Accomplishment
                  </p>

                  <div className="dashboard-completion-gauge dashboard-physical-gauge">
                    {dashboardData.totalProjects > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dashboardData.physicalPerformanceData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="70%"
                              outerRadius="92%"
                              startAngle={90}
                              endAngle={-270}
                              paddingAngle={2}
                            >
                              {dashboardData.physicalPerformanceData.map((entry) => (
                                <Cell
                                  key={entry.name}
                                  fill={
                                    entry.name === 'Physical Accomplishment'
                                      ? '#16a34a'
                                      : '#e2e8f0'
                                  }
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="dashboard-completion-center" aria-hidden="true">
                          <div>
                            <strong>
                              {formatPhysicalPercent(dashboardData.physicalAccomplishment)}
                            </strong>
                            <span>Physical</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="dashboard-empty-state compact">
                        <strong>No physical data</strong>
                        <p>No project records match the current dashboard filters.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="dashboard-performance-gauge-wrap">
                  <p className="dashboard-performance-gauge-label">
                    Financial Accomplishment
                  </p>

                  <div className="dashboard-completion-gauge dashboard-financial-gauge">
                    {dashboardData.totalProjects > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dashboardData.financialPerformanceData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="70%"
                              outerRadius="92%"
                              startAngle={90}
                              endAngle={-270}
                              paddingAngle={2}
                            >
                              {dashboardData.financialPerformanceData.map((entry) => (
                                <Cell
                                  key={entry.name}
                                  fill={
                                    entry.name === 'Financial Accomplishment'
                                      ? '#f97316'
                                      : '#e2e8f0'
                                  }
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="dashboard-completion-center" aria-hidden="true">
                          <div>
                            <strong>
                              {formatPercent(dashboardData.financialAccomplishment)}
                            </strong>
                            <span>Financial</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="dashboard-empty-state compact">
                        <strong>No financial data</strong>
                        <p>No project records match the current dashboard filters.</p>
                      </div>
                    )}
                  </div>
                </div>
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
                  <strong>Scope:</strong> Physical and financial accomplishment use the same
                  cost-weighted dashboard methodology as Executive View and respond to the
                  current program, funding year, province, and LGU filters. The Completed
                  and Remaining cards at right are project counts and are shown separately.
                </div>
              </div>
            </div>
          </article>
        </section>

        ) : null}

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
      </div>
    </>
  )
}
