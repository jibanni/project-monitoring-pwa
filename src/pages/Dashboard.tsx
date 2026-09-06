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
import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'
import { getOfficialProjectCost } from '../utils/projectVariance'
import { buildProgramFilterOptions, normalizeProgramName } from '../utils/program'
import {
  getCanonicalProjectLgu,
  getCanonicalProjectProvinceOrHuc,
} from '../data/region10Directory'
import '../styles/dashboardDrilldownFilters.css'
import '../styles/dashboardFinancialAccomplishment.css'

type ProjectRecord = SharedProjectRow & AorProjectLike & Record<string, any>

type DrilldownState = {
  title: string
  subtitle: string
  projects: ProjectRecord[]
}

type DrilldownFilters = {
  search: string
  program: string
  year: string
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

const DEFAULT_DRILLDOWN_FILTERS: DrilldownFilters = {
  search: '',
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
  return asNumber(
    project.physical_accomplishment ??
      project.physical_progress ??
      project.physical_percentage ??
      project.physical ??
      project.actual_physical,
  )
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

  if (risk.includes('high') || risk.includes('critical')) return '#ef4444'
  if (risk.includes('moderate') || risk.includes('medium')) return '#f97316'
  if (risk.includes('low')) return '#eab308'
  if (risk.includes('none') || risk.includes('no risk')) return '#16a34a'

  return CHART_COLORS[fallbackIndex % CHART_COLORS.length]
}

export default function Dashboard() {
  const isDesktopViewport = useDesktopViewport()
  const navigate = useNavigate()
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
  const [drilldownFilters, setDrilldownFilters] = useState<DrilldownFilters>({
    ...DEFAULT_DRILLDOWN_FILTERS,
    ...(rememberedDrilldownRef.current?.filters || {}),
  })
  const [isDashboardScrolled, setIsDashboardScrolled] = useState(false)
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({
    ...DEFAULT_DASHBOARD_FILTERS,
    ...(rememberedView.filters || {}),
  })
  const [showDashboardFilters, setShowDashboardFilters] = useState(
    Boolean(rememberedView.showFilters),
  )

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

    const financialWeightBase = visibleProjects.reduce(
      (sum, project) => sum + Math.max(0, getOfficialProjectCost(project as unknown as Parameters<typeof getOfficialProjectCost>[0])),
      0,
    )

    const weightedFinancialAccomplishment = visibleProjects.reduce(
      (sum, project) => {
        const cost = Math.max(0, getOfficialProjectCost(project as unknown as Parameters<typeof getOfficialProjectCost>[0]))

        return sum + cost * (getFinancialProgress(project) / 100)
      },
      0,
    )

    const simpleFinancialAverage =
      visibleProjects.length > 0
        ? visibleProjects.reduce(
            (sum, project) => sum + getFinancialProgress(project),
            0,
          ) / visibleProjects.length
        : 0

    const financialAccomplishment =
      financialWeightBase > 0
        ? (weightedFinancialAccomplishment / financialWeightBase) * 100
        : simpleFinancialAverage

    const financialAccomplishmentMethod =
      financialWeightBase > 0
        ? 'Cost-weighted across visible project costs'
        : 'Average across visible projects'

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
      financialAccomplishment,
      financialAccomplishmentMethod,
      financialPerformanceData,
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
        matchesDashboardFilter(
          getProgramFilterValue(project),
          drilldownFilters.program,
        ) &&
        matchesDashboardFilter(getYearFilterValue(project), drilldownFilters.year) &&
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
      drilldownFilters.program !== ALL_FILTER_VALUE ||
      drilldownFilters.year !== ALL_FILTER_VALUE ||
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

          <div className="dashboard-drilldown-filterbar" aria-label="Drilldown filters">
            <label className="dashboard-drilldown-search">
              <span>Search</span>
              <input
                type="search"
                value={drilldownFilters.search}
                placeholder="Search project or location"
                onChange={(event) =>
                  updateDrilldownFilters({ search: event.target.value })
                }
              />
            </label>

            <label>
              <span>Program</span>
              <select
                value={drilldownFilters.program}
                onChange={(event) =>
                  updateDrilldownFilters({ program: event.target.value })
                }
              >
                <option value={ALL_FILTER_VALUE}>All Programs</option>
                {drilldownFilterOptions.programs.map((program) => {
                  const label = normalizeProgramName(program) || String(program)
                  return (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </label>

            <label>
              <span>FY</span>
              <select
                value={drilldownFilters.year}
                onChange={(event) =>
                  updateDrilldownFilters({ year: event.target.value })
                }
              >
                <option value={ALL_FILTER_VALUE}>All FY</option>
                {drilldownFilterOptions.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Province/HUC</span>
              <select
                value={drilldownFilters.province}
                onChange={(event) =>
                  updateDrilldownFilters({
                    province: event.target.value,
                    lgu: ALL_FILTER_VALUE,
                  })
                }
              >
                <option value={ALL_FILTER_VALUE}>All Provinces/HUCs</option>
                {drilldownFilterOptions.provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>LGU</span>
              <select
                value={drilldownFilters.lgu}
                onChange={(event) =>
                  updateDrilldownFilters({ lgu: event.target.value })
                }
              >
                <option value={ALL_FILTER_VALUE}>All LGUs</option>
                {drilldownFilterOptions.lgus.map((lgu) => (
                  <option key={lgu} value={lgu}>
                    {lgu}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="dashboard-drilldown-filter-reset"
              disabled={!hasActiveDrilldownFilters}
              onClick={clearDrilldownFilters}
            >
              Reset
            </button>
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

          <button type="button" onClick={() => void refreshProjects()}>
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
                <option
                  value={ALL_FILTER_VALUE}
                  label="All Programs"
                  style={{ textTransform: 'none' }}
                >
                  All Programs
                </option>
                {filterOptions.programs.map((program) => {
                  const programLabel = normalizeProgramName(program) || String(program)

                  return (
                    <option
                      key={programLabel}
                      value={programLabel}
                      label={programLabel}
                      style={{ textTransform: 'none' }}
                    >
                      {programLabel}
                    </option>
                  )
                })}
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
              <span>Province/HUC</span>
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
                <option value={ALL_FILTER_VALUE}>All Provinces/HUCs</option>
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
              <div className="dashboard-performance-gauges">
                <div className="dashboard-performance-gauge-wrap">
                  <p className="dashboard-performance-gauge-label">
                    Project Completion
                  </p>

                  <div className="dashboard-completion-gauge dashboard-physical-gauge">
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
                  <strong>Scope:</strong> Both gauges use the currently visible dashboard
                  records. Financial accomplishment is cost-weighted across visible project
                  costs, and both gauges change when you filter by program, funding year,
                  province, or LGU.
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