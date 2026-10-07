import { useEffect, useMemo, useRef, useState } from 'react'
import { getPmsProjectStatus, getPmsRiskLevel } from '../utils/projectStatus'
import {
  getContractExpirationInfo,
  getProjectSlippageVariance,
} from '../utils/projectVariance'
import { isProjectEligibleForAggregatePerformance } from '../utils/projectMetricEligibility'

type ProjectRecord = Record<string, any>

type ExecutiveDashboardProps = {
  projects: ProjectRecord[]
  onOpenDetailed: () => void
}

type ExecutiveFilterMemory = {
  area?: string
  fundingYear?: string
  fundingYears?: string[]
  program?: string
}

const EXECUTIVE_FILTER_MEMORY_KEY = 'pms10-executive-dashboard-filters-v1'

function readExecutiveFilterMemory(): ExecutiveFilterMemory {
  try {
    const raw = window.localStorage.getItem(EXECUTIVE_FILTER_MEMORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

type RotationDirection = 'forward' | 'backward'

type AttentionItem = {
  key: string
  label: string
  projects: ProjectRecord[]
}

type AttentionBreakdownItem = {
  key: string
  label: string
  value: number
  color: string
}

type StatusLegendItem = {
  name: string
  value: number
  color: string
}

type NadaiDrilldown = {
  bandLabel: string
  metric: 'physical' | 'financial'
  projects: ProjectRecord[]
}


const SWIPE_THRESHOLD = 70
const STATUS_ORDER = [
  'Completed',
  'Suspended / Cancelled',
  'Terminated',
  'Not Yet Started',
  'Under Procurement',
  'Ongoing',
] as const

const STATUS_COLORS: Record<string, string> = {
  Completed: '#16a34a',
  Ongoing: '#2563eb',
  'Under Procurement': '#f97316',
  'Not Yet Started': '#64748b',
  'Suspended / Cancelled': '#dc2626',
  Terminated: '#991b1b',
}

const ATTENTION_COLORS: Record<string, string> = {
  expired: '#dc2626',
  criticalStatus: '#b91c1c',
  slippage: '#f97316',
}

const LGSF_PROGRAMS = new Set([
  'CMGP',
  'FALGU',
  'GEF',
  'GREEN, GREEN, GREEN',
  'SAFPB',
  'SBDP',
])

const PROGRAM_UI_ORDER = [
  'CMGP',
  'FALGU',
  'GEF',
  'GREEN, GREEN, GREEN',
  'RAPID Growth',
  'SAFPB',
  'SBDP',
  'SGLGIF',
  'SALINTUBIG',
]

function programDisplayLabel(program: string) {
  if (program === 'GREEN, GREEN, GREEN') return '3GP'
  return program
}

function compareProgramOptions(a: string, b: string) {
  const aIndex = PROGRAM_UI_ORDER.indexOf(a)
  const bIndex = PROGRAM_UI_ORDER.indexOf(b)

  if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
  if (aIndex >= 0) return -1
  if (bIndex >= 0) return 1
  return a.localeCompare(b)
}

function initialFundingYears(memory: ExecutiveFilterMemory) {
  if (Array.isArray(memory.fundingYears)) {
    return Array.from(
      new Set(
        memory.fundingYears
          .map((year) => String(year).trim())
          .filter((year) => /^20\d{2}$/.test(year)),
      ),
    ).sort((a, b) => Number(b) - Number(a))
  }

  const legacyYear = String(memory.fundingYear ?? '').trim()
  return /^20\d{2}$/.test(legacyYear) ? [legacyYear] : []
}

function fundingYearTriggerLabel(years: string[]) {
  if (!years.length) return 'All FY'
  if (years.length === 1) return `FY ${years[0]}`
  if (years.length === 2) return `FY ${years[0]} + ${years[1]}`
  return `${years.length} FYs`
}

function fundingYearScopeLabel(years: string[]) {
  if (!years.length) return 'All Funding Years'
  if (years.length === 1) return `FY ${years[0]}`
  return years.map((year) => `FY ${year}`).join(', ')
}

const AREA_ORDER = [
  'Region X',
  'Bukidnon',
  'Camiguin',
  'Lanao del Norte',
  'Misamis Occidental',
  'Misamis Oriental',
  'Cagayan de Oro City',
  'Iligan City',
]

function textValue(value: unknown) {
  return String(value ?? '').trim()
}

function normalize(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number) {
  return `${clamp(value).toFixed(2)}%`
}

function formatMoney(value: number) {
  if (value >= 1_000_000_000) return `₱${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(2)}K`
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function formatAsOfDate() {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
}

function projectCost(project: ProjectRecord) {
  return numberValue(
    project.project_cost ??
      project.amount ??
      project.budget ??
      project.total_project_cost ??
      project.approved_budget ??
      project.allocated_amount,
  )
}

function physical(project: ProjectRecord) {
  return clamp(
    numberValue(
      project.physical_accomplishment ??
        project.physical_progress ??
        project.actual_physical_accomplishment ??
        project.accomplishment,
    ),
  )
}

function financial(project: ProjectRecord) {
  return clamp(
    numberValue(
      project.financial_accomplishment ??
        project.financial_progress ??
        project.actual_financial_accomplishment,
    ),
  )
}

function weightedAverage(
  projects: ProjectRecord[],
  getter: (project: ProjectRecord) => number,
) {
  const eligible = projects.filter(isProjectEligibleForAggregatePerformance)
  if (!eligible.length) return 0

  const totalCost = eligible.reduce((sum, project) => sum + projectCost(project), 0)
  if (totalCost <= 0) return 0

  return (
    eligible.reduce(
      (sum, project) => sum + getter(project) * projectCost(project),
      0,
    ) / totalCost
  )
}

function projectProgram(project: ProjectRecord) {
  return (
    textValue(
      project.program ??
        project.program_name ??
        project.funding_source ??
        project.funding_program ??
        project.source_of_fund,
    ) || 'Unspecified Program'
  )
}

function canonicalProgram(value: unknown) {
  const raw = normalize(value)
  if (!raw) return 'Unspecified Program'
  if (raw.includes('falgu')) return 'FALGU'
  if (
    raw === '3gp' ||
    raw.includes('green green green') ||
    raw.includes('green, green, green')
  ) return 'GREEN, GREEN, GREEN'
  if (raw.includes('gef')) return 'GEF'
  if (raw.includes('sbdp')) return 'SBDP'
  if (raw.includes('safpb')) return 'SAFPB'
  if (raw.includes('cmgp') || raw.includes('kalsada')) return 'CMGP'
  if (raw.includes('rapid')) return 'RAPID Growth'
  if (raw.includes('salintubig')) return 'SALINTUBIG'
  if (raw.includes('sglgif')) return 'SGLGIF'
  if (raw.includes('lgsf')) return textValue(value).toUpperCase()
  return textValue(value) || 'Unspecified Program'
}

function projectProvince(project: ProjectRecord) {
  const province = textValue(
    project.province ?? project.province_name ?? project.aor_province,
  )
  const lgu = textValue(
    project.lgu ??
      project.municipality ??
      project.city_municipality ??
      project.city ??
      project.local_government_unit,
  )

  const combined = normalize(`${province} ${lgu}`)
  if (combined.includes('cagayan de oro')) return 'Cagayan de Oro City'
  if (combined.includes('iligan')) return 'Iligan City'
  if (normalize(province).includes('bukidnon')) return 'Bukidnon'
  if (normalize(province).includes('camiguin')) return 'Camiguin'
  if (normalize(province).includes('lanao del norte')) return 'Lanao del Norte'
  if (normalize(province).includes('misamis occidental')) return 'Misamis Occidental'
  if (normalize(province).includes('misamis oriental')) return 'Misamis Oriental'

  return province || 'Unspecified'
}

function projectFundingYear(project: ProjectRecord) {
  const raw = textValue(
    project.funding_year ?? project.fundingYear ?? project.year ?? project.project_year ?? project.fy,
  )
  const match = raw.match(/(20\d{2})/)
  return match?.[1] || raw || 'Unspecified'
}

function projectTitle(project: ProjectRecord) {
  return textValue(project.project_name ?? project.project_title ?? project.title ?? project.name) || 'Untitled Project'
}

function projectLgu(project: ProjectRecord) {
  return textValue(project.lgu ?? project.municipality ?? project.city_municipality ?? project.city ?? project.local_government_unit) || projectProvince(project)
}

function projectCode(project: ProjectRecord) {
  return textValue(project.subaybayan_project_code ?? project.project_code ?? project.code ?? project.reference_code ?? project.id)
}

function formatDate(value: Date | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(value)
}

function statusName(project: ProjectRecord) {
  const status = getPmsProjectStatus(project)

  if (status === 'Suspended' || status === 'Cancelled') {
    return 'Suspended / Cancelled'
  }

  return status
}

function validDate(value: unknown) {
  const raw = textValue(value)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}


function fundDownloadDate(project: ProjectRecord) {
  const candidates = [
    project.fund_download_date,
    project.date_fund_downloaded,
    project.fund_release_date,
    project.nadai_date,
    project.nadai_received_date,
    project.download_date,
    project.release_date,
  ]

  for (const candidate of candidates) {
    const date = validDate(candidate)
    if (date) return date
  }

  return null
}

function expiredContract(project: ProjectRecord) {
  if (getPmsProjectStatus(project) === 'Completed' || physical(project) >= 100) return false
  return getContractExpirationInfo(project).isExpired
}

function negativeSlippage(project: ProjectRecord) {
  if (getPmsProjectStatus(project) === 'Completed' || physical(project) >= 100) return false
  return getProjectSlippageVariance(project) <= -15
}

function suspendedOrCancelled(project: ProjectRecord) {
  const status = getPmsProjectStatus(project)
  return status === 'Suspended' || status === 'Cancelled'
}




function compareAreaNames(a: string, b: string) {
  const ai = AREA_ORDER.indexOf(a)
  const bi = AREA_ORDER.indexOf(b)
  if (ai >= 0 && bi >= 0) return ai - bi
  if (ai >= 0) return -1
  if (bi >= 0) return 1
  return a.localeCompare(b)
}

function areaSubtitle(area: string) {
  if (area === 'Region X') return 'Regional Portfolio Overview'
  if (area === 'Cagayan de Oro City' || area === 'Iligan City') {
    return 'Highly Urbanized City Portfolio'
  }
  return 'Provincial Portfolio Overview'
}

function median(values: number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function pointOnCircle(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}


function pieSegmentPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = endAngle - startAngle

  // A single SVG arc whose start/end points are identical will not render
  // a true 360-degree pie. Draw two 180-degree arcs for 100% status cohorts.
  if (sweep >= 359.999) {
    const start = pointOnCircle(cx, cy, radius, startAngle)
    const opposite = pointOnCircle(cx, cy, radius, startAngle + 180)

    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 1 1 ${opposite.x} ${opposite.y}`,
      `A ${radius} ${radius} 0 1 1 ${start.x} ${start.y}`,
      'Z',
    ].join(' ')
  }

  const largeArc = sweep > 180 ? 1 : 0
  const outerStart = pointOnCircle(cx, cy, radius, startAngle)
  const outerEnd = pointOnCircle(cx, cy, radius, endAngle)

  return [
    `M ${cx} ${cy}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    'Z',
  ].join(' ')
}




function StatusOverviewChart({
  statusData,
}: {
  totalProjects: number
  statusData: StatusLegendItem[]
}) {
  const total = statusData.reduce((sum, item) => sum + item.value, 0)

  const ordered = STATUS_ORDER
    .map((name) => statusData.find((item) => item.name === name))
    .filter((item): item is StatusLegendItem => Boolean(item && item.value > 0))

  if (!total || !ordered.length) {
    return (
      <div className="exec16-status-empty">
        <strong>No project status data available.</strong>
      </div>
    )
  }

  const size = 360
  const cx = size / 2
  const cy = size / 2
  const radius = 154
  let currentAngle = 270

  const slices = ordered.map((item) => {
    const percent = item.value / total
    const angleSize = percent * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angleSize
    currentAngle = endAngle

    return {
      ...item,
      percent,
      startAngle,
      endAngle,
      midAngle: startAngle + angleSize / 2,
    }
  })

  return (
    <div className="exec25-status-chart" aria-label="Project status chart">
      <div className="exec25-status-pie-wrap">
        <svg
          className="exec25-status-pie"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Project status distribution"
        >
          <defs>
            <filter id="exec25PieShadow" x="-20%" y="-20%" width="160%" height="160%">
              <feDropShadow dx="0" dy="7" stdDeviation="8" floodOpacity="0.10" />
            </filter>
          </defs>

          {slices.map((slice) => {
            const labelPoint = pointOnCircle(
              cx,
              cy,
              radius * 0.67,
              slice.midAngle,
            )

            return (
              <g key={slice.name} filter="url(#exec25PieShadow)">
                <path
                  d={pieSegmentPath(
                    cx,
                    cy,
                    radius,
                    slice.startAngle,
                    slice.endAngle,
                  )}
                  fill={slice.color}
                />

                {slice.percent >= 0.03 ? (
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    className="exec25-status-slice-value"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {formatCount(slice.value)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div
        className={`exec25-status-legend exec25-status-legend-${Math.min(ordered.length, 5)}`}
        aria-label="Project status legend"
      >
        {ordered.map((item) => (
          <div
            key={item.name}
            className="exec25-status-legend-item"
            style={{ color: item.color }}
          >
            <span
              className="exec25-status-legend-dot"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="exec25-status-legend-name">{item.name}</span>
            <strong>{formatCount(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}



function AttentionReasonChart({
  items,
  total,
}: {
  items: AttentionBreakdownItem[]
  total: number
}) {
  if (!total || !items.length) {
    return <div className="exec26-attention-empty">No monitoring concerns in this view.</div>
  }

  const size = 340
  const cx = size / 2
  const cy = size / 2
  const radius = 142
  let currentAngle = 270

  const slices = items.map((item) => {
    const percent = item.value / total
    const angleSize = percent * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angleSize
    currentAngle = endAngle

    return {
      ...item,
      percent,
      startAngle,
      endAngle,
      midAngle: startAngle + angleSize / 2,
    }
  })

  return (
    <div className="exec26-attention-chart">
      <div className="exec26-attention-pie-wrap">
        <svg
          className="exec26-attention-pie"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Reasons projects need attention"
        >
          {slices.map((slice) => {
            const labelPoint = pointOnCircle(cx, cy, radius * 0.67, slice.midAngle)

            return (
              <g key={slice.key}>
                <path
                  d={pieSegmentPath(cx, cy, radius, slice.startAngle, slice.endAngle)}
                  fill={slice.color}
                />
                {slice.percent >= 0.07 ? (
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="exec26-attention-pie-value"
                  >
                    {formatCount(slice.value)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="exec26-attention-legend">
        {items.map((item) => (
          <div className="exec26-attention-legend-item" key={item.key}>
            <span className="exec26-attention-dot" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
            <strong>{formatCount(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}


function DualRingMiniChart({
  physicalValue,
  financialValue,
  onPhysicalClick,
  onFinancialClick,
}: {
  physicalValue: number
  financialValue: number
  onPhysicalClick?: () => void
  onFinancialClick?: () => void
}) {
  const physicalPct = clamp(physicalValue)
  const financialPct = clamp(financialValue)

  const size = 128
  const center = size / 2
  const outerRadius = 52
  const innerRadius = 36

  const outerCircumference = 2 * Math.PI * outerRadius
  const innerCircumference = 2 * Math.PI * innerRadius

  return (
    <div className="exec18-dual-ring-chart" aria-hidden="true">
      <svg className="exec18-dual-ring-svg" viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            className="exec18-dual-ring-track exec18-dual-ring-track-outer"
          />
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            className="exec18-dual-ring-fill exec18-dual-ring-fill-outer"
            strokeDasharray={`${(physicalPct / 100) * outerCircumference} ${outerCircumference}`}
          />

          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            className="exec18-dual-ring-track exec18-dual-ring-track-inner"
          />
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            className="exec18-dual-ring-fill exec18-dual-ring-fill-inner"
            strokeDasharray={`${(financialPct / 100) * innerCircumference} ${innerCircumference}`}
          />
          <circle cx={center} cy={center} r={outerRadius} className="exec19-dual-ring-hit exec19-dual-ring-hit-physical" onClick={onPhysicalClick} />
          <circle cx={center} cy={center} r={innerRadius} className="exec19-dual-ring-hit exec19-dual-ring-hit-financial" onClick={onFinancialClick} />
        </g>

        <circle
          cx={center}
          cy={center}
          r="21"
          className="exec18-dual-ring-core"
        />
      </svg>
    </div>
  )
}

export default function ExecutiveDashboard({
  projects,
  onOpenDetailed,
}: ExecutiveDashboardProps) {
  const executiveFilterMemory = useMemo(() => readExecutiveFilterMemory(), [])
  const [selectedProvince, setSelectedProvince] = useState(
    executiveFilterMemory.area || 'Region X',
  )
  const [selectedFundingYears, setSelectedFundingYears] = useState<string[]>(
    () => initialFundingYears(executiveFilterMemory),
  )
  const [selectedProgram, setSelectedProgram] = useState(
    executiveFilterMemory.program || 'All Programs',
  )
  const [nadaiDrilldown, setNadaiDrilldown] = useState<NadaiDrilldown | null>(null)
  const [showAttentionReasons, setShowAttentionReasons] = useState(false)
  const [isFundingYearMenuOpen, setIsFundingYearMenuOpen] = useState(false)
  const [rotationDirection, setRotationDirection] = useState<RotationDirection>('forward')
  const [areaRotationDirection, setAreaRotationDirection] = useState<RotationDirection>('forward')
  const [animationNonce, setAnimationNonce] = useState(0)
  const [areaAnimationNonce, setAreaAnimationNonce] = useState(0)
  const swipeStartX = useRef<number | null>(null)
  const programTrackRef = useRef<HTMLDivElement | null>(null)
  const programButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const fundingYearMenuRef = useRef<HTMLDivElement | null>(null)
  const [programIndicator, setProgramIndicator] = useState({ left: 0, width: 0, ready: false })

  useEffect(() => {
    // Executive View is a true full-screen workspace on every viewport.
    // Hide the normal PMS10 shell while this view is mounted so the sidebar,
    // global header and advisory ticker can never squeeze or offset the board.
    document.documentElement.classList.add('pms-executive-dashboard-active')
    document.body.classList.add('pms-executive-dashboard-active')

    return () => {
      document.documentElement.classList.remove('pms-executive-dashboard-active')
      document.body.classList.remove('pms-executive-dashboard-active')
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EXECUTIVE_FILTER_MEMORY_KEY,
        JSON.stringify({
          area: selectedProvince,
          fundingYear:
            selectedFundingYears.length === 1 ? selectedFundingYears[0] : 'All FY',
          fundingYears: selectedFundingYears,
          program: selectedProgram,
        }),
      )
    } catch {
      // Keep dashboard usable even if browser storage is unavailable.
    }
  }, [selectedProvince, selectedFundingYears, selectedProgram])

  const provinceOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        projects
          .map(projectProvince)
          .filter(
            (value) =>
              value && value !== 'Unspecified' && value !== 'Region X',
          ),
      ),
    ).sort(compareAreaNames)

    return ['Region X', ...values]
  }, [projects])

  useEffect(() => {
    if (!provinceOptions.includes(selectedProvince)) setSelectedProvince('Region X')
  }, [provinceOptions, selectedProvince])

  const provinceProjects = useMemo(() => {
    if (selectedProvince === 'Region X') return projects
    return projects.filter((project) => projectProvince(project) === selectedProvince)
  }, [projects, selectedProvince])

  const fundingYearOptions = useMemo(() => {
    return Array.from(
      new Set(
        provinceProjects
          .map(projectFundingYear)
          .filter((year) => /^20\d{2}$/.test(year)),
      ),
    ).sort((a, b) => Number(b) - Number(a))
  }, [provinceProjects])

  useEffect(() => {
    setSelectedFundingYears((current) => {
      const valid = current
        .filter((year) => fundingYearOptions.includes(year))
        .sort((a, b) => Number(b) - Number(a))

      if (
        valid.length === current.length &&
        valid.every((year, index) => year === current[index])
      ) {
        return current
      }

      return valid
    })
  }, [fundingYearOptions])

  const isAllFundingYears = selectedFundingYears.length === 0
  const fundingYearSelectionKey = isAllFundingYears
    ? 'all-fy'
    : selectedFundingYears.join('-')

  const fundingYearProjects = useMemo(() => {
    if (isAllFundingYears) return provinceProjects

    const selected = new Set(selectedFundingYears)
    return provinceProjects.filter((project) =>
      selected.has(projectFundingYear(project)),
    )
  }, [provinceProjects, selectedFundingYears, isAllFundingYears])

  const programOptions = useMemo(() => {
    // Program tabs belong to the selected Area, not to the selected Funding Year.
    // This keeps the chosen program stable when the user changes FY.
    const values = Array.from(
      new Set<string>(
        provinceProjects.map((project) =>
          canonicalProgram(projectProgram(project)),
        ),
      ),
    )
      .filter((value) => value && value !== 'Unspecified Program')
      .sort(compareProgramOptions)

    const hasLgsfPrograms = values.some((value) => LGSF_PROGRAMS.has(value))

    return [
      'All Programs',
      ...(hasLgsfPrograms ? ['All LGSF'] : []),
      ...values,
    ]
  }, [provinceProjects])

  useEffect(() => {
    if (!programOptions.includes(selectedProgram)) setSelectedProgram('All Programs')
  }, [programOptions, selectedProgram])

  const scopedProjects = useMemo(() => {
    if (selectedProgram === 'All Programs') return fundingYearProjects

    if (selectedProgram === 'All LGSF') {
      return fundingYearProjects.filter((project) =>
        LGSF_PROGRAMS.has(canonicalProgram(projectProgram(project))),
      )
    }

    return fundingYearProjects.filter(
      (project) =>
        canonicalProgram(projectProgram(project)) === selectedProgram,
    )
  }, [fundingYearProjects, selectedProgram])

  const totalCost = useMemo(
    () =>
      scopedProjects
        .filter(isProjectEligibleForAggregatePerformance)
        .reduce((sum, project) => sum + projectCost(project), 0),
    [scopedProjects],
  )

  const overallPhysical = useMemo(
    () => weightedAverage(scopedProjects, physical),
    [scopedProjects],
  )

  const overallFinancial = useMemo(
    () => weightedAverage(scopedProjects, financial),
    [scopedProjects],
  )

  const statusData = useMemo<StatusLegendItem[]>(() => {
    const buckets = new Map<string, ProjectRecord[]>([
      ['Completed', []],
      ['Ongoing', []],
      ['Under Procurement', []],
      ['Not Yet Started', []],
      ['Suspended / Cancelled', []],
      ['Terminated', []],
    ])

    scopedProjects.forEach((project) => {
      const current = statusName(project)
      buckets.get(current)?.push(project)
    })

    return Array.from(buckets.entries())
      .map(([name, rows]) => ({
        name,
        value: rows.length,
        color: STATUS_COLORS[name] || '#64748b',
      }))
      .filter((item) => item.value > 0)
  }, [scopedProjects])

  const highRiskProjects = useMemo(
    () => scopedProjects.filter((project) => getPmsRiskLevel(project) === 'High'),
    [scopedProjects],
  )

  const attentionItems = useMemo<AttentionItem[]>(() => {
    return [
      {
        key: 'expired',
        label: 'Expired Contract',
        projects: highRiskProjects.filter(expiredContract),
      },
      {
        key: 'criticalStatus',
        label: 'Suspended / Cancelled Project',
        projects: highRiskProjects.filter(suspendedOrCancelled),
      },
      {
        key: 'slippage',
        label: 'Negative Slippage ≥ 15%',
        projects: highRiskProjects.filter(negativeSlippage),
      },
    ].filter((item) => item.projects.length > 0)
  }, [highRiskProjects])

  const attentionBreakdown = useMemo<AttentionBreakdownItem[]>(() => {
    const counts = new Map<string, number>()

    // A project can satisfy more than one High-Risk rule.
    // Assign it once using this priority only for the pie so the slices sum
    // exactly to the High Risk KPI: Expired -> Suspended/Cancelled -> Slippage.
    highRiskProjects.forEach((project) => {
      const primaryReason = attentionItems.find((item) => item.projects.includes(project))
      if (!primaryReason) return
      counts.set(primaryReason.key, (counts.get(primaryReason.key) ?? 0) + 1)
    })

    return attentionItems
      .map((item) => ({
        key: item.key,
        label: item.label,
        value: counts.get(item.key) ?? 0,
        color: ATTENTION_COLORS[item.key] ?? '#64748b',
      }))
      .filter((item) => item.value > 0)
  }, [attentionItems, highRiskProjects])

  const nadaiProjects = useMemo(
    () => scopedProjects.filter((project) => Boolean(fundDownloadDate(project))),
    [scopedProjects],
  )

  const nadaiYearAnalysis = useMemo(() => {
    const DAY_MS = 24 * 60 * 60 * 1000
    const MONTH_DAYS = 30.4375
    const now = new Date()

    const sourceRows = nadaiProjects
      .map((project) => {
        const nadaiDate = fundDownloadDate(project)
        if (!nadaiDate) return null

        const startDate = validDate(project.start_date)
        const ageDays = Math.max(0, (now.getTime() - nadaiDate.getTime()) / DAY_MS)
        const rawStartLagDays = startDate
          ? (startDate.getTime() - nadaiDate.getTime()) / DAY_MS
          : null

        return {
          project,
          nadaiYear: nadaiDate.getFullYear(),
          ageMonths: ageDays / MONTH_DAYS,
          startLagDays:
            rawStartLagDays !== null &&
            Number.isFinite(rawStartLagDays) &&
            rawStartLagDays >= 0
              ? rawStartLagDays
              : null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    const years = Array.from(
      new Set(sourceRows.map((row) => row.nadaiYear)),
    ).sort((a, b) => a - b)

    const yearRows = years.map((year) => {
      const cohort = sourceRows
        .filter((row) => row.nadaiYear === year)
        .map((row) => row.project)

      return {
        key: `nadai-${year}`,
        year,
        label: `NADAI ${year}`,
        projects: cohort,
        physical: weightedAverage(cohort, physical),
        financial: weightedAverage(cohort, financial),
      }
    })

    return {
      yearRows,
      medianAgeMonths: median(sourceRows.map((row) => row.ageMonths)),
      medianStartLagDays: median(
        sourceRows
          .map((row) => row.startLagDays)
          .filter((value): value is number => value !== null),
      ),
    }
  }, [nadaiProjects])

  useEffect(() => {
    const track = programTrackRef.current
    const activeButton = programButtonRefs.current[selectedProgram]
    if (!track || !activeButton) return

    const updateIndicator = () => {
      setProgramIndicator({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
        ready: true,
      })
    }

    updateIndicator()
    activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateIndicator)
      : null

    observer?.observe(track)
    observer?.observe(activeButton)
    window.addEventListener('resize', updateIndicator)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateIndicator)
    }
  }, [selectedProgram, programOptions])

  const areaCarouselLabel = (area: string) => {
    const normalized = area.trim().toLowerCase()

    if (normalized === 'lanao del norte') return 'LDN'
    if (normalized === 'misamis oriental') return 'MisOr'
    if (normalized === 'misamis occidental') return 'MisOc'
    if (
      normalized === 'cagayan de oro' ||
      normalized === 'cagayan de oro city' ||
      normalized === 'city of cagayan de oro'
    ) return 'CDO'

    return area
  }

  const currentAreaIndex = Math.max(0, provinceOptions.indexOf(selectedProvince))

  const areaCarouselItems = useMemo(() => {
    if (!provinceOptions.length) return []

    const offsets = [-2, -1, 0, 1, 2]
    return offsets.map((offset) => {
      const index = (currentAreaIndex + offset + provinceOptions.length) % provinceOptions.length
      return {
        area: provinceOptions[index],
        index,
        offset,
      }
    })
  }, [provinceOptions, currentAreaIndex])

  const goToAreaIndex = (nextIndex: number) => {
    if (!provinceOptions.length) return
    const bounded = (nextIndex + provinceOptions.length) % provinceOptions.length
    const nextArea = provinceOptions[bounded]
    const direction: RotationDirection = bounded >= currentAreaIndex ? 'forward' : 'backward'

    setRotationDirection(direction)
    setAreaRotationDirection(direction)
    setSelectedProvince(nextArea)
    setSelectedFundingYears([])
    setSelectedProgram('All Programs')
    setAnimationNonce((value) => value + 1)
    setAreaAnimationNonce((value) => value + 1)
  }

  const goPreviousArea = () => goToAreaIndex(currentAreaIndex - 1)
  const goNextArea = () => goToAreaIndex(currentAreaIndex + 1)

  const chooseProgram = (program: string) => {
    const currentIndex = Math.max(0, programOptions.indexOf(selectedProgram))
    const nextIndex = Math.max(0, programOptions.indexOf(program))
    setRotationDirection(nextIndex >= currentIndex ? 'forward' : 'backward')
    setSelectedProgram(program)
    setAnimationNonce((value) => value + 1)
  }

  const chooseFundingYear = (year: string) => {
    if (year === 'All FY') {
      setSelectedFundingYears([])
    } else {
      setSelectedFundingYears((current) => {
        const next = current.includes(year)
          ? current.filter((item) => item !== year)
          : [...current, year]

        return next.sort((a, b) => Number(b) - Number(a))
      })
    }

    // Preserve the currently selected Program when changing FY.
    // Keep the menu open so multiple FYs can be selected in one interaction.
    setRotationDirection('forward')
    setAnimationNonce((value) => value + 1)
  }

  const handlePointerDown = (clientX: number) => {
    swipeStartX.current = clientX
  }

  const handlePointerUp = (clientX: number) => {
    if (swipeStartX.current === null) return
    const distance = clientX - swipeStartX.current
    swipeStartX.current = null

    if (Math.abs(distance) < SWIPE_THRESHOLD) return
    if (distance < 0) goNextArea()
    else goPreviousArea()
  }

  const handleKeyboard = (key: string) => {
    if (key === 'ArrowLeft') goPreviousArea()
    if (key === 'ArrowRight') goNextArea()
  }

  return (
    <section className="exec13-shell" aria-label="PMS10 Executive Dashboard">
      <article className="exec13-board">
        <header className="exec13-topbar">
          <div className="exec13-brand">
            <img src="/dilg-logo.png" alt="DILG" />
            <div>
              <strong>Executive Dashboard</strong>
              <span>As of {formatAsOfDate()}</span>
            </div>
          </div>

          <div className="exec23-area-selector" aria-label="Area selector">
            <div
              key={`area-wheel-${selectedProvince}-${areaAnimationNonce}`}
              className={`exec23-area-wheel exec23-area-wheel-${areaRotationDirection}`}
            >
              {areaCarouselItems.map((item) => (
                <button
                  key={`${item.area}-${item.offset}`}
                  type="button"
                  className={`exec23-area-item offset-${item.offset} ${item.offset === 0 ? 'active' : ''}`}
                  onClick={() => item.offset !== 0 && goToAreaIndex(item.index)}
                  aria-current={item.offset === 0 ? 'true' : undefined}
                  aria-label={item.offset === 0 ? `${item.area}, current area` : `Show ${item.area}`}
                  title={item.area}
                >
                  {areaCarouselLabel(item.area)}
                </button>
              ))}
            </div>

            <span className="exec23-area-subtitle">{areaSubtitle(selectedProvince)}</span>
            <small className="exec23-area-scope">
              {fundingYearScopeLabel(selectedFundingYears)} · {programDisplayLabel(selectedProgram)}
            </small>
          </div>

          <div className="exec2535-mobile-view-switch">
            <nav className="dashboard-mode-switch" aria-label="Dashboard view">
              <button type="button" className="active" aria-current="page">
                Executive View
              </button>
              <button type="button" onClick={onOpenDetailed}>
                Detailed View
              </button>
            </nav>
          </div>
        </header>

        <div
          className="exec13-canvas"
          tabIndex={0}
          onPointerDown={(event) => handlePointerDown(event.clientX)}
          onPointerUp={(event) => handlePointerUp(event.clientX)}
          onPointerCancel={() => { swipeStartX.current = null }}
          onKeyDown={(event) => handleKeyboard(event.key)}
        >
          <div className="exec19-filter-row exec193-filter-stack">
            <nav className="exec19-program-slider exec191-program-switcher" aria-label="Programs">
              <div
                ref={programTrackRef}
                className="exec13-program-tab-strip exec19-program-track exec191-program-track"
              >
                <span
                  className={`exec191-program-indicator${programIndicator.ready ? ' ready' : ''}`}
                  style={{
                    width: `${programIndicator.width}px`,
                    transform: `translateX(${programIndicator.left}px)`,
                  }}
                  aria-hidden="true"
                />

                {programOptions.map((program) => (
                  <button
                    key={program}
                    ref={(element) => { programButtonRefs.current[program] = element }}
                    type="button"
                    className={program === selectedProgram ? 'active' : ''}
                    aria-pressed={program === selectedProgram}
                    onClick={() => chooseProgram(program)}
                  >
                    {programDisplayLabel(program)}
                  </button>
                ))}
              </div>
            </nav>

            <div
              className={`exec19-fy-filter exec193-fy-below exec2517-fy-picker ${isFundingYearMenuOpen ? 'is-open' : ''}`}
              ref={fundingYearMenuRef}
            >
              <span className="exec2517-fy-label">Funding Year</span>

              <button
                type="button"
                className="exec2517-fy-trigger exec2531-fy-trigger"
                aria-haspopup="listbox"
                aria-expanded={isFundingYearMenuOpen}
                aria-label={`Funding Year: ${fundingYearTriggerLabel(selectedFundingYears)}`}
                onClick={() => setIsFundingYearMenuOpen((open) => !open)}
              >
                <span>{fundingYearTriggerLabel(selectedFundingYears)}</span>
                <span className="exec2517-fy-chevron" aria-hidden="true" />
              </button>

              {isFundingYearMenuOpen ? (
                <div
                  className="exec2517-fy-menu exec2531-fy-menu"
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Funding Year options"
                >
                  <div className="exec2533-fy-options-scroll">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isAllFundingYears}
                      className={`exec2517-fy-option exec2531-fy-option exec2533-fy-option ${isAllFundingYears ? 'is-selected' : ''}`}
                      onClick={() => chooseFundingYear('All FY')}
                    >
                      <span
                        className={`exec2517-fy-check exec2531-fy-check exec2533-fy-checkbox ${isAllFundingYears ? 'is-checked' : ''}`}
                        aria-hidden="true"
                      >
                        {isAllFundingYears ? '✓' : ''}
                      </span>
                      <span>All FY</span>
                    </button>

                    <div className="exec2531-fy-divider" aria-hidden="true" />

                    {fundingYearOptions.map((year) => {
                      const isSelected = selectedFundingYears.includes(year)

                      return (
                        <button
                          key={year}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`exec2517-fy-option exec2531-fy-option exec2533-fy-option ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => chooseFundingYear(year)}
                        >
                          <span
                            className={`exec2517-fy-check exec2531-fy-check exec2533-fy-checkbox ${isSelected ? 'is-checked' : ''}`}
                            aria-hidden="true"
                          >
                            {isSelected ? '✓' : ''}
                          </span>
                          <span>FY {year}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="exec2531-fy-menu-footer exec2533-fy-menu-footer">
                    <span>
                      {isAllFundingYears
                        ? 'All funding years'
                        : `${selectedFundingYears.length} selected`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFundingYearMenuOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <section
            key={`summary-${selectedProvince}-${fundingYearSelectionKey}-${selectedProgram}-${animationNonce}`}
            className={`exec13-summary exec13-slide-${rotationDirection}`}
            aria-label="Executive summary"
          >
            <div className="exec13-summary-card projects">
              <strong>{formatCount(scopedProjects.length)}</strong>
              <span>Projects</span>
              <small>{formatMoney(totalCost)} total project cost</small>
            </div>

            <div className="exec13-summary-card physical">
              <strong>{formatPercent(overallPhysical)}</strong>
              <span>Physical Accomplishment</span>
              <small>Work completed</small>
            </div>

            <div className="exec13-summary-card financial">
              <strong>{formatPercent(overallFinancial)}</strong>
              <span>Financial Accomplishment</span>
              <small>Funds disbursed against project cost</small>
            </div>

            <button
              type="button"
              className="exec13-summary-card attention exec26-attention-card"
              onClick={() => setShowAttentionReasons(true)}
              aria-label={`High Risk: ${formatCount(highRiskProjects.length)} projects. View reasons.`}
            >
              <strong>{formatCount(highRiskProjects.length)}</strong>
              <span>High Risk</span>
              <small>View reasons for high-risk classification</small>
            </button>
          </section>

          <section
            key={`main-${selectedProvince}-${fundingYearSelectionKey}-${selectedProgram}-${animationNonce}`}
            className={`exec13-main exec13-slide-${rotationDirection} ${isAllFundingYears ? 'exec22-status-only' : ''}`}
          >
            <article className="exec13-panel exec13-status-panel">
              <div className="exec13-panel-heading">
                <div>
                  <h2>Project Status</h2>

                </div>
              </div>

              <StatusOverviewChart
                totalProjects={scopedProjects.length}
                statusData={statusData}
              />
            </article>

            {!isAllFundingYears ? (
            <article className="exec13-panel exec13-fund-panel">
              <div className="exec13-panel-heading exec13-fund-heading exec2516-fund-heading">
                <h2>Progress by Fund Download Year</h2>
                <div className="exec2516-nadai-coverage" aria-label="NADAI coverage">
                  <strong>
                    {formatCount(nadaiProjects.length)} of {formatCount(scopedProjects.length)} projects with NADAI
                  </strong>
                  <span>
                    {formatCount(Math.max(0, scopedProjects.length - nadaiProjects.length))} projects without NADAI
                  </span>
                </div>
              </div>

              {nadaiProjects.length ? (
                <>
                  <div
                    className={`exec13-age-list exec21-nadai-year-list exec21-count-${Math.min(nadaiYearAnalysis.yearRows.length, 6)}`}
                  >
                    {nadaiYearAnalysis.yearRows.map((row) => (
                      <div className="exec13-age-row exec18-age-row exec21-nadai-year-card" key={row.key}>
                        <div className="exec13-age-label exec21-nadai-year-label">
                          <strong>{row.label}</strong>
                          <span>{formatCount(row.projects.length)} projects</span>
                        </div>

                        <div className="exec18-age-body">
                          <DualRingMiniChart
                            physicalValue={row.physical}
                            financialValue={row.financial}
                            onPhysicalClick={() => setNadaiDrilldown({ bandLabel: row.label, metric: 'physical', projects: row.projects })}
                            onFinancialClick={() => setNadaiDrilldown({ bandLabel: row.label, metric: 'financial', projects: row.projects })}
                          />

                          <div className="exec18-age-stats exec19-age-stats">
                            <button type="button" className="exec18-age-stat exec18-age-stat-physical" onClick={() => setNadaiDrilldown({ bandLabel: row.label, metric: 'physical', projects: row.projects })}>
                              <span><i className="physical-dot" />Physical</span><strong>{formatPercent(row.physical)}</strong>
                            </button>
                            <button type="button" className="exec18-age-stat exec18-age-stat-financial" onClick={() => setNadaiDrilldown({ bandLabel: row.label, metric: 'financial', projects: row.projects })}>
                              <span><i className="financial-dot" />Financial</span><strong>{formatPercent(row.financial)}</strong>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="exec13-fund-empty">
                  <strong>No fund download dates recorded.</strong>
                </div>
              )}
            </article>
            ) : null}
          </section>

          <div className="exec13-bottom-nav">
            <div className="exec13-bottom-hint">Swipe, use arrow keys, or select an area above</div>
          </div>
        </div>
      {showAttentionReasons ? (
        <div
          className="exec19-drilldown-backdrop exec26-attention-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAttentionReasons(false)
          }}
        >
          <section
            className="exec26-attention-modal"
            role="dialog"
            aria-modal="true"
            aria-label="High Risk reasons"
          >
            <header className="exec26-attention-modal-header">
              <div>
                <h3>High Risk</h3>
                <span>{formatCount(highRiskProjects.length)} projects</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAttentionReasons(false)}
                aria-label="Close High Risk reasons"
              >
                ×
              </button>
            </header>

            <AttentionReasonChart
              items={attentionBreakdown}
              total={highRiskProjects.length}
            />
          </section>
        </div>
      ) : null}

      {nadaiDrilldown ? (
        <div className="exec19-drilldown-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNadaiDrilldown(null) }}>
          <section className="exec19-drilldown" role="dialog" aria-modal="true" aria-label={`${nadaiDrilldown.bandLabel} ${nadaiDrilldown.metric} projects`}>
            <header className="exec19-drilldown-header">
              <div>
                <span>Progress After Fund Download</span>
                <h3>{nadaiDrilldown.bandLabel} · {nadaiDrilldown.metric === 'physical' ? 'Physical' : 'Financial'}</h3>
                <small>{formatCount(nadaiDrilldown.projects.length)} projects</small>
              </div>
              <button type="button" onClick={() => setNadaiDrilldown(null)} aria-label="Close project list">×</button>
            </header>
            <div className="exec19-drilldown-table-wrap">
              <table className="exec19-drilldown-table">
                <thead><tr><th>Project</th><th>LGU</th><th>FY</th><th>NADAI Date</th><th>Physical</th><th>Financial</th></tr></thead>
                <tbody>
                  {nadaiDrilldown.projects.map((project, index) => (
                    <tr key={projectCode(project) || `${projectTitle(project)}-${index}`}>
                      <td><strong>{projectTitle(project)}</strong>{projectCode(project) ? <small>{projectCode(project)}</small> : null}</td>
                      <td>{projectLgu(project)}</td><td>{projectFundingYear(project)}</td><td>{formatDate(fundDownloadDate(project))}</td>
                      <td className={nadaiDrilldown.metric === 'physical' ? 'active-metric physical' : ''}>{formatPercent(physical(project))}</td>
                      <td className={nadaiDrilldown.metric === 'financial' ? 'active-metric financial' : ''}>{formatPercent(financial(project))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
      </article>

    </section>
  )
}
