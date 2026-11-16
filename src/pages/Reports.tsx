import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useSharedProjects } from '../lib/projectDataCache'
import { useAuth } from '../context/AuthContext'
import { useDesktopViewport } from '../hooks/useDesktopViewport'
import { readPageView, writePageView } from '../lib/pageViewMemory'
import { filterProjectsByAor } from '../utils/aorAccess'
import { normalizeProgramName } from '../utils/program'
import MultiSelectFilter from '../components/MultiSelectFilter'
import SingleSelectFilter from '../components/SingleSelectFilter'
import { matchesMultiFilter, normalizeMultiFilterValue, pruneMultiFilterValues } from '../utils/multiFilter'
import { getPmsRiskLevel } from '../utils/projectStatus'
import {
  exportProgramSummaryExcel,
  generateProgramSummaryPdf,
  generateProjectBrieferPdf,
  type ProjectBrieferUpdate,
} from '../utils/reportExport'
import {
  canonicalizeRegion10Lgu,
  canonicalizeRegion10ProvinceOrHuc,
  getCanonicalProjectLgu,
  getCanonicalProjectProvinceOrHuc,
} from '../data/region10Directory'
import {
  formatSignedVariance,
  getTargetPhysicalInfo,
} from '../utils/projectVariance'
import '../styles/reports.css'
import '../styles/unifiedFilters.css'
import '../styles/pageHero.css'

import '../styles/filterUniformityV6.css'
type ProjectRow = {
  id: string
  project_name: string | null
  description: string | null
  status: string | null
  project_type: string | null
  funding_source: string | null
  implementing_office: string | null
  contractor: string | null
  budget: number | string | null
  start_date: string | null
  target_completion_date: string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  latitude: number | string | null
  longitude: number | string | null
  physical_accomplishment: number | string | null
  financial_accomplishment: number | string | null
  risk_level: string | null
  last_inspection_date: string | null
  updated_at: string | null
  funding_year?: number | string | null
  contract_amount?: number | string | null
  contract_duration?: number | string | null
  revised_contract_duration?: number | string | null
  contract_expiration_date?: string | null
  revised_contract_expiration_date?: string | null
  project_code?: string | null
  subaybayan_project_code?: string | null
  mode_of_implementation?: string | null
  disbursement_amount?: number | string | null
  beneficiaries?: string | number | null
  target_beneficiaries?: string | number | null
  [key: string]: unknown
}

type PoEngineerAssignmentRow = {
  id?: string | null
  user_id: string | null
  province: string | null
  municipality: string | null
  is_active: boolean | null
}

type ProfileLookupRow = {
  id: string
  full_name: string | null
  email: string | null
  role?: string | null
  approved?: boolean | null
  is_active?: boolean | null
}

type LatestUpdateInfo = {
  engineer_id: string | null
  inspection_date: string | null
  created_at: string | null
}

type ProfileLookupMap = Record<string, ProfileLookupRow>
type LatestUpdateMap = Record<string, LatestUpdateInfo>

const REPORT_PREVIEW_LIMIT = 120

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: unknown) {
  return (
    'Php ' +
    toNumber(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function formatPercent(value: unknown) {
  return `${toNumber(value).toFixed(2)}%`
}


function formatFundingYear(value: unknown) {
  const raw = textValue(value)
  if (!raw) return '—'

  const cleaned = raw.replace(/^FY\s*/i, '').trim()
  return cleaned ? `FY ${cleaned}` : '—'
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return 'No date'

  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)

  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusClass(status: string | null) {
  const normalized = textValue(status).toLowerCase()

  if (normalized.includes('complete')) return 'completed'
  if (normalized.includes('ongoing')) return 'ongoing'
  if (normalized.includes('not')) return 'not-started'
  if (normalized.includes('suspended')) return 'delayed'
  if (normalized.includes('delayed')) return 'delayed'
  if (normalized.includes('cancelled') || normalized.includes('terminated')) return 'cancelled'

  return 'default'
}

function getRiskClass(risk: string | null) {
  const normalized = textValue(risk).toLowerCase()

  if (!normalized || normalized === 'none' || normalized.includes('no risk')) return 'none'
  if (normalized.includes('high')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) {
    return 'moderate'
  }
  if (normalized.includes('low')) return 'low'

  return 'none'
}


function getProjectVariance(project: ProjectRow) {
  return getTargetPhysicalInfo(project)
}


function getReportRisk(project: ProjectRow) {
  return getPmsRiskLevel(project as unknown as Record<string, any>)
}

function sameText(left: unknown, right: unknown) {
  const leftKey = textValue(left).toLowerCase().replace(/\s+/g, ' ')
  const rightKey = textValue(right).toLowerCase().replace(/\s+/g, ' ')

  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function uniqueTextValues(values: unknown[]) {
  const seen = new Set<string>()
  const output: string[] = []

  values.forEach((value) => {
    const label = textValue(value)
    const key = label.toLowerCase().replace(/\s+/g, ' ')

    if (!label || !key || seen.has(key)) return

    seen.add(key)
    output.push(label)
  })

  return output
}

function getCanonicalReportRole(role: unknown) {
  const value = textValue(role).toLowerCase().replace(/\s+/g, ' ')

  if (value === 'admin') return 'Admin'
  if (value === 'ro engineer' || value === 'ro engineers') return 'RO Engineer'
  if (value === 'engineer' || value === 'po engineer' || value === 'po engineers') return 'PO Engineer'
  if (value === 'rd' || value === 'regional director') return 'RD'
  if (value === 'ard' || value === 'assistant regional director') return 'ARD'
  if (value === 'pdmu chief' || value === 'pdmu chief/head' || value === 'pdmu head' || value === 'pdmu') return 'PDMU Chief'
  if (value === 'pd' || value === 'provincial director') return 'PD'
  if (value === 'cd' || value === 'city director') return 'CD'
  if (value === 'clgoo' || value === 'city local government operations officer') return 'CLGOO'
  if (value === 'mlgoo' || value === 'municipal local government operations officer') return 'MLGOO'
  if (value === 'peo' || value === 'project evaluation officer') return 'PEO'
  if (value === 'viewer') return 'Viewer'

  return textValue(role)
}

function reportProjectMatchesProvince(project: ProjectRow, province: unknown) {
  return sameText(
    getCanonicalProjectProvinceOrHuc(project.province, project.municipality),
    canonicalizeRegion10ProvinceOrHuc(province),
  )
}

function reportProjectMatchesMunicipality(project: ProjectRow, municipality: unknown) {
  const provinceOrHuc = getCanonicalProjectProvinceOrHuc(
    project.province,
    project.municipality,
  )

  return sameText(
    getCanonicalProjectLgu(project.province, project.municipality),
    canonicalizeRegion10Lgu(municipality, provinceOrHuc),
  )
}

function getStrictReportAorProjects(
  projects: ProjectRow[],
  auth: ReturnType<typeof useAuth>,
) {
  // Keep Reports on the exact same READ scope as Dashboard / Registry / Map.
  return filterProjectsByAor(projects, auth)
}

function uniqueSortedTextValues(values: unknown[]) {
  return Array.from(new Set(values.map(textValue).filter(Boolean))).sort()
}

function getActiveReportPoAssignments(auth: ReturnType<typeof useAuth>) {
  return (auth.poEngineerLguAssignments || []).filter(
    (assignment) => assignment.is_active !== false,
  )
}

function getActiveReportRoAssignments(auth: ReturnType<typeof useAuth>) {
  return (auth.roEngineerProvinceAssignments || []).filter(
    (assignment) => assignment.is_active !== false,
  )
}

function getReportProvinceOptions(
  aorProjects: ProjectRow[],
  auth: ReturnType<typeof useAuth>,
) {
  const profile = auth.profile
  const role = getCanonicalReportRole(profile?.role)

  if (!profile || profile.approved !== true || profile.is_active === false) return []

  if (auth.isAdmin || role === 'Admin' || role === 'RD' || role === 'ARD' || role === 'PDMU Chief') {
    return uniqueSortedTextValues(
      aorProjects.map((project) =>
        getCanonicalProjectProvinceOrHuc(project.province, project.municipality),
      ),
    )
  }

  if (auth.isROEngineer || role === 'RO Engineer') {
    const assignments = getActiveReportRoAssignments(auth)
    const assignedProvinces = uniqueSortedTextValues(
      assignments.map((assignment) =>
        canonicalizeRegion10ProvinceOrHuc(assignment.province),
      ),
    )

    return assignedProvinces.length > 0
      ? assignedProvinces
      : uniqueSortedTextValues([canonicalizeRegion10ProvinceOrHuc(profile.province)])
  }

  if (auth.isPOEngineer || auth.isEngineer || role === 'PO Engineer') {
    const assignments = getActiveReportPoAssignments(auth)
    const assignedProvinces = uniqueSortedTextValues(
      assignments.map((assignment) =>
        canonicalizeRegion10ProvinceOrHuc(assignment.province),
      ),
    )

    return assignedProvinces.length > 0
      ? assignedProvinces
      : uniqueSortedTextValues([canonicalizeRegion10ProvinceOrHuc(profile.province)])
  }

  if (auth.isPD || auth.isPEO || role === 'PD' || role === 'PEO') {
    return uniqueSortedTextValues([canonicalizeRegion10ProvinceOrHuc(profile.province)])
  }

  const aorProjectProvinces = uniqueSortedTextValues(
    aorProjects.map((project) =>
      getCanonicalProjectProvinceOrHuc(project.province, project.municipality),
    ),
  )

  if (aorProjectProvinces.length > 0) return aorProjectProvinces

  return uniqueSortedTextValues([
    canonicalizeRegion10ProvinceOrHuc(profile.province || profile.huc),
  ])
}

function getReportMunicipalityOptions(
  aorProjects: ProjectRow[],
  auth: ReturnType<typeof useAuth>,
  provinceFilter: string,
) {
  const profile = auth.profile
  const role = getCanonicalReportRole(profile?.role)

  if (!profile || profile.approved !== true || profile.is_active === false) return []

  if (auth.isPOEngineer || auth.isEngineer || role === 'PO Engineer') {
    const scopedProjects = aorProjects.filter((project) =>
      provinceFilter
        ? sameText(
            getCanonicalProjectProvinceOrHuc(
              project.province,
              project.municipality,
            ),
            provinceFilter,
          )
        : true,
    )

    return uniqueSortedTextValues(
      scopedProjects.map((project) =>
        getCanonicalProjectLgu(
          project.province,
          project.municipality,
        ),
      ),
    )
  }

  if (auth.isCD || role === 'CD') {
    return uniqueSortedTextValues([
      canonicalizeRegion10ProvinceOrHuc(profile.huc),
    ])
  }

  if (auth.isCLGOO || role === 'CLGOO') {
    return uniqueSortedTextValues([
      canonicalizeRegion10Lgu(profile.city, profile.province),
    ])
  }

  if (auth.isMLGOO || role === 'MLGOO') {
    return uniqueSortedTextValues([
      canonicalizeRegion10Lgu(profile.municipality, profile.province),
    ])
  }

  return uniqueSortedTextValues(
    aorProjects
      .filter((project) =>
        provinceFilter
          ? getCanonicalProjectProvinceOrHuc(
              project.province,
              project.municipality,
            ) === provinceFilter
          : true,
      )
      .map((project) =>
        getCanonicalProjectLgu(project.province, project.municipality),
      ),
  )
}

function getProfileDisplayName(profile: ProfileLookupRow | undefined, fallback?: string | null) {
  if (profile?.full_name) return profile.full_name
  if (profile?.email) return profile.email
  if (fallback) return `User ${fallback.slice(0, 8)}`
  return 'Unknown user'
}

function getAssignedPoEngineersForProject(
  project: ProjectRow,
  assignments: PoEngineerAssignmentRow[],
  profileMap: ProfileLookupMap,
) {
  const matchingAssignments = assignments.filter(
    (assignment) =>
      assignment.is_active !== false &&
      reportProjectMatchesProvince(project, assignment.province) &&
      reportProjectMatchesMunicipality(project, assignment.municipality),
  )

  const names = uniqueTextValues(
    matchingAssignments.map((assignment) =>
      assignment.user_id
        ? getProfileDisplayName(profileMap[assignment.user_id], assignment.user_id)
        : '',
    ),
  )

  return names.length > 0 ? names.join(', ') : 'No assigned PO Engineer'
}



function getAssignedAorLabel(project: ProjectRow) {
  const province = textValue(project.province) || 'No province'
  const lgu = textValue(project.municipality) || 'No LGU'

  return `${province} / ${lgu}`
}

function getEngineersAssignedOfficeSummary(projects: ProjectRow[]) {
  const officeLabels = uniqueTextValues(
    projects.map((project) =>
      getCanonicalProjectProvinceOrHuc(project.province, project.municipality),
    ),
  ).sort((left, right) => left.localeCompare(right))

  if (officeLabels.length === 0) return 'PDMU Engineers of DILG Region X'

  return `PDMU Engineers of DILG ${officeLabels.join(', ')}`
}

function formatAssignedEngineerName(name: string) {
  const cleaned = textValue(name)
  if (!cleaned) return ''
  if (/^(engr\.?|engineer)\s/i.test(cleaned)) return cleaned
  return `Engineer ${cleaned}`
}

function getLatestUpdateForProject(project: ProjectRow, latestUpdateMap: LatestUpdateMap) {
  return latestUpdateMap[project.id] || null
}

function getLatestUpdateDate(project: ProjectRow, latestUpdateMap: LatestUpdateMap) {
  const latestUpdate = getLatestUpdateForProject(project, latestUpdateMap)

  return latestUpdate?.inspection_date || latestUpdate?.created_at || project.last_inspection_date || null
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="5.75" />
      <path d="m15 15 4.25 4.25" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 3.5h8.4L18 7.1v13.4H6V3.5Z" />
      <path d="M14 3.8v4h4" />
      <path d="M8.2 13.3h1.3c.8 0 1.3-.5 1.3-1.2s-.5-1.2-1.3-1.2H8.2v4.4" />
      <path d="M12.5 10.9v4.4h1.2c1.4 0 2.2-.8 2.2-2.2s-.8-2.2-2.2-2.2h-1.2Z" />
    </svg>
  )
}

function ExcelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h8" />
      <path d="M12 8v8" />
    </svg>
  )
}

export default function Reports() {
  const isDesktopViewport = useDesktopViewport()
  const auth = useAuth()

  const {
    projects,
    refreshing,
    errorMessage,
    refreshProjects,
  } = useSharedProjects<ProjectRow>()
  const [poEngineerAssignments, setPoEngineerAssignments] = useState<PoEngineerAssignmentRow[]>([])
  const [profileMap, setProfileMap] = useState<ProfileLookupMap>({})
  const [latestUpdateMap] = useState<LatestUpdateMap>({})
  const rememberedView = readPageView('reports', {
    showFilters: false,
    searchTerm: '',
    provinceFilter: '',
    municipalityFilter: '',
    programFilters: [],
    fundingYearFilters: [],
    programFilter: '',
    fundingYearFilter: '',
    statusFilter: '',
    riskFilter: '',
  })

  const [showFilters, setShowFilters] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [isReportsScrolled, setIsReportsScrolled] = useState(false)

  const [searchTerm, setSearchTerm] = useState(rememberedView.searchTerm || '')
  const [provinceFilter, setProvinceFilter] = useState(rememberedView.provinceFilter || '')
  const [municipalityFilter, setMunicipalityFilter] = useState(rememberedView.municipalityFilter || '')
  const [programFilters, setProgramFilters] = useState<string[]>(
    normalizeMultiFilterValue(rememberedView.programFilters ?? rememberedView.programFilter),
  )
  const [fundingYearFilters, setFundingYearFilters] = useState<string[]>(
    normalizeMultiFilterValue(rememberedView.fundingYearFilters ?? rememberedView.fundingYearFilter),
  )
  const [statusFilter, setStatusFilter] = useState(rememberedView.statusFilter || '')
  const [riskFilter, setRiskFilter] = useState(rememberedView.riskFilter || '')
  const [generatingBrieferId, setGeneratingBrieferId] = useState<string | null>(null)

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const normalizedDeferredSearchTerm = deferredSearchTerm.trim().toLowerCase()

  useEffect(() => {
    writePageView('reports', {
      showFilters,
      searchTerm,
      provinceFilter,
      municipalityFilter,
      programFilters,
      fundingYearFilters,
      statusFilter,
      riskFilter,
    })
  }, [
    showFilters,
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilters,
    fundingYearFilters,
    statusFilter,
    riskFilter,
  ])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    const cached = window.localStorage.getItem('pms10:reports-reference-cache:v1')

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          assignments?: PoEngineerAssignmentRow[]
          profiles?: ProfileLookupMap
        }
        setPoEngineerAssignments(Array.isArray(parsed.assignments) ? parsed.assignments : [])
        setProfileMap(parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {})
      } catch (error) {
        console.warn('Unable to read cached report references.', error)
      }
    }

    const timer = window.setTimeout(() => {
      void loadReportReferenceData()
    }, 450)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        setIsReportsScrolled(window.scrollY > 28)
        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  async function loadProjects() {
    await refreshProjects()
    void loadReportReferenceData()
  }

  async function loadReportReferenceData() {
    if (!navigator.onLine) return

    try {
      const assignmentsResult = await supabase
        .from('po_engineer_lgu_assignments')
        .select('id, user_id, province, municipality, is_active')
        .eq('is_active', true)

      if (assignmentsResult.error) throw assignmentsResult.error

      const loadedAssignments = (assignmentsResult.data || []) as PoEngineerAssignmentRow[]
      setPoEngineerAssignments(loadedAssignments)

      const profileIds = uniqueTextValues(
        loadedAssignments.map((assignment) => assignment.user_id),
      )

      let nextProfileMap: ProfileLookupMap = {}

      if (profileIds.length > 0) {
        const profilesResult = await supabase
          .from('profiles')
          .select('id, full_name, email, role, approved, is_active')
          .in('id', profileIds)

        if (profilesResult.error) throw profilesResult.error

        nextProfileMap = ((profilesResult.data || []) as ProfileLookupRow[]).reduce<ProfileLookupMap>(
          (map, profile) => {
            map[profile.id] = profile
            return map
          },
          {},
        )
      }

      setProfileMap(nextProfileMap)
      window.localStorage.setItem(
        'pms10:reports-reference-cache:v1',
        JSON.stringify({
          assignments: loadedAssignments,
          profiles: nextProfileMap,
          cachedAt: new Date().toISOString(),
        }),
      )
    } catch (error) {
      console.warn('Report reference refresh failed.', error)
    }
  }

  function clearFilters() {
    setSearchTerm('')
    setProvinceFilter('')
    setMunicipalityFilter('')
    setProgramFilters([])
    setFundingYearFilters([])
    setStatusFilter('')
    setRiskFilter('')
  }

  const aorProjects = useMemo(() => {
    return getStrictReportAorProjects(projects, auth)
  }, [projects, auth])

  const provinces = useMemo(() => {
    return getReportProvinceOptions(aorProjects, auth)
  }, [aorProjects, auth])

  const municipalities = useMemo(() => {
    return getReportMunicipalityOptions(aorProjects, auth, provinceFilter)
  }, [aorProjects, auth, provinceFilter])

  const programs = useMemo(() => {
    return Array.from(
      new Set(
        aorProjects
          .map((project) => normalizeProgramName(normalizeProgramName(project.funding_source || project.project_type)))
          .filter(Boolean),
      ),
    ).sort()
  }, [aorProjects])

  const fundingYears = useMemo(() => {
    return Array.from(
      new Set(
        aorProjects
          .map((project) => textValue(project.funding_year))
          .filter(Boolean),
      ),
    ).sort((left, right) => right.localeCompare(left))
  }, [aorProjects])

  const statuses = useMemo(() => {
    return Array.from(
      new Set(aorProjects.map((project) => textValue(project.status)).filter(Boolean)),
    ).sort()
  }, [aorProjects])

  const risks = useMemo(() => {
    return Array.from(
      new Set(aorProjects.map((project) => getReportRisk(project)).filter(Boolean)),
    ).sort()
  }, [aorProjects])

  useEffect(() => {
    if (provinceFilter && !provinces.includes(provinceFilter)) {
      setProvinceFilter('')
      setMunicipalityFilter('')
      return
    }

    if (municipalityFilter && !municipalities.includes(municipalityFilter)) {
      setMunicipalityFilter('')
    }

    const nextProgramFilters = pruneMultiFilterValues(programFilters, programs)
    if (nextProgramFilters.length !== programFilters.length) {
      setProgramFilters(nextProgramFilters)
    }

    const nextFundingYearFilters = pruneMultiFilterValues(fundingYearFilters, fundingYears)
    if (nextFundingYearFilters.length !== fundingYearFilters.length) {
      setFundingYearFilters(nextFundingYearFilters)
    }

    if (statusFilter && !statuses.includes(statusFilter)) {
      setStatusFilter('')
    }

    if (riskFilter && !risks.map(String).includes(riskFilter)) {
      setRiskFilter('')
    }
  }, [
    provinceFilter,
    provinces,
    municipalityFilter,
    municipalities,
    programFilters,
    programs,
    fundingYearFilters,
    fundingYears,
    statusFilter,
    statuses,
    riskFilter,
    risks,
  ])

  const reportFilterIndex = useMemo(() => {
    return aorProjects.map((project) => ({
      project,
      province: getCanonicalProjectProvinceOrHuc(
        project.province,
        project.municipality,
      ),
      municipality: getCanonicalProjectLgu(
        project.province,
        project.municipality,
      ),
      program: normalizeProgramName(
        project.funding_source || project.project_type,
      ),
      fundingYear: textValue(project.funding_year),
      status: textValue(project.status),
      risk: getReportRisk(project),
    }))
  }, [aorProjects])

  const filteredProjects = useMemo(() => {
    return reportFilterIndex
      .filter((entry) => {
        const {
          project,
          province,
          municipality,
          program,
          fundingYear,
          status,
          risk,
        } = entry

        const provinceMatches = provinceFilter ? province === provinceFilter : true
        const municipalityMatches = municipalityFilter ? municipality === municipalityFilter : true
        const programMatches = matchesMultiFilter(program, programFilters)
        const fundingYearMatches = matchesMultiFilter(fundingYear, fundingYearFilters)
        const statusMatches = statusFilter ? status === statusFilter : true
        const riskMatches = riskFilter ? risk === riskFilter : true

        if (
          !provinceMatches ||
          !municipalityMatches ||
          !programMatches ||
          !fundingYearMatches ||
          !statusMatches ||
          !riskMatches
        ) {
          return false
        }

        if (!normalizedDeferredSearchTerm) return true

        const assignedPoEngineers = getAssignedPoEngineersForProject(
          project,
          poEngineerAssignments,
          profileMap,
        )
        const latestUpdateDate = getLatestUpdateDate(project, latestUpdateMap)

        const searchableText = [
          project.project_name,
          project.description,
          project.barangay,
          project.municipality,
          project.province,
          project.funding_source,
          project.project_type,
          project.status,
          risk,
          project.contractor,
          project.implementing_office,
          assignedPoEngineers,
          latestUpdateDate,
        ]
          .map(textValue)
          .join(' ')
          .toLowerCase()

        return searchableText.includes(normalizedDeferredSearchTerm)
      })
      .map((entry) => entry.project)
  }, [
    reportFilterIndex,
    normalizedDeferredSearchTerm,
    poEngineerAssignments,
    profileMap,
    latestUpdateMap,
    provinceFilter,
    municipalityFilter,
    programFilters,
    fundingYearFilters,
    statusFilter,
    riskFilter,
  ])

  const previewProjects = useMemo(
    () => filteredProjects.slice(0, REPORT_PREVIEW_LIMIT),
    [filteredProjects],
  )

  const filteredEngineersSummary = useMemo(
    () => getEngineersAssignedOfficeSummary(filteredProjects),
    [filteredProjects],
  )

  const activeFilterCount = [
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilters.length ? 'programs' : '',
    fundingYearFilters.length ? 'years' : '',
    statusFilter,
    riskFilter,
  ].filter(Boolean).length

  const hasActiveSearch = activeFilterCount > 0
  const reportProjects = hasActiveSearch ? filteredProjects : aorProjects

  function getReportFiltersLabel() {
    const labels = [
      programFilters.length
        ? `Programs: ${programFilters.join(', ')}`
        : 'Programs: All',
      fundingYearFilters.length
        ? `Funding Years: ${fundingYearFilters.map((year) => `FY ${year}`).join(', ')}`
        : 'Funding Years: All',
      provinceFilter ? `Province/HUC: ${provinceFilter}` : '',
      municipalityFilter ? `LGU: ${municipalityFilter}` : '',
      statusFilter ? `Status: ${statusFilter}` : '',
      riskFilter ? `Risk: ${riskFilter}` : '',
      searchTerm.trim() ? `Search: ${searchTerm.trim()}` : '',
    ].filter(Boolean)

    return labels.join(' | ')
  }

  function getGeneratedBy() {
    return textValue(auth.profile?.full_name || auth.profile?.email || 'PMS10 User')
  }

  async function generatePdfReport() {
    await generateProgramSummaryPdf(reportProjects, {
      generatedBy: getGeneratedBy(),
      generatedAt: new Date(),
      engineersAssigned: getEngineersAssignedOfficeSummary(reportProjects),
      filtersLabel: getReportFiltersLabel(),
    })
  }

  async function exportExcelReport() {
    await exportProgramSummaryExcel(reportProjects, {
      generatedBy: getGeneratedBy(),
      generatedAt: new Date(),
      engineersAssigned: getEngineersAssignedOfficeSummary(reportProjects),
      filtersLabel: getReportFiltersLabel(),
    })
  }

  async function generateProjectBriefer(project: ProjectRow) {
    setGeneratingBrieferId(project.id)

    try {
      let latestUpdate: ProjectBrieferUpdate | null = null

      if (navigator.onLine) {
        const latestResult = await supabase
          .from('project_updates')
          .select(
            'engineer_id, inspection_date, status, physical_accomplishment, financial_accomplishment, disbursement_amount, issues, recommendations, remarks, created_at',
          )
          .eq('project_id', project.id)
          .order('inspection_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!latestResult.error) {
          latestUpdate = latestResult.data as ProjectBrieferUpdate | null
        }
      }

      const assignedNames = getAssignedPoEngineersForProject(
        project,
        poEngineerAssignments,
        profileMap,
      )
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name && name !== 'No assigned PO Engineer')

      if (assignedNames.length === 0 && latestUpdate?.engineer_id) {
        let updateEngineerProfile = profileMap[latestUpdate.engineer_id]

        if (!updateEngineerProfile && navigator.onLine) {
          const profileResult = await supabase
            .from('profiles')
            .select('id, full_name, email, role, approved, is_active')
            .eq('id', latestUpdate.engineer_id)
            .maybeSingle()

          if (!profileResult.error && profileResult.data) {
            updateEngineerProfile = profileResult.data as ProfileLookupRow
          }
        }

        if (updateEngineerProfile) {
          assignedNames.push(getProfileDisplayName(updateEngineerProfile, latestUpdate.engineer_id))
        }
      }

      const assignedEngineer = uniqueTextValues(assignedNames)
        .map(formatAssignedEngineerName)
        .join(', ') || 'No assigned engineer recorded'

      await generateProjectBrieferPdf(project, {
        generatedBy: getGeneratedBy(),
        generatedAt: new Date(),
        assignedEngineer,
        latestUpdate,
      })
    } finally {
      setGeneratingBrieferId(null)
    }
  }

  const reportsFabStack = (
    <div className="reports-fab-stack" aria-label="Report actions">
      <button
        type="button"
        className="reports-fab reports-fab-excel"
        onClick={exportExcelReport}
        disabled={aorProjects.length === 0}
        aria-label="Export Program Summary Excel"
        title="Export Program Summary Excel"
      >
        <ExcelIcon />
      </button>

      <button
        type="button"
        className="reports-fab reports-fab-pdf"
        onClick={generatePdfReport}
        disabled={aorProjects.length === 0}
        aria-label="Generate Program Summary PDF"
        title="Generate Program Summary PDF"
      >
        <PdfIcon />
      </button>
    </div>
  )


  return (
    <>
      <div className={`reports-page ${isReportsScrolled ? 'is-reports-scrolled' : ''}`}>
        {!isDesktopViewport && (
          <section className="reports-hero">
            <div>
              <p className="reports-eyebrow">Reports Module</p>
              <h1>Project Reports</h1>
              <p>
                Generate Program Summary Reports for regional reporting and Project Briefers for
                management, inaugurations, groundbreakings, inspections, and project visits.
              </p>
            </div>
          </section>
        )}

        {errorMessage && projects.length === 0 && (
          <section className="reports-error-card" role="alert">
            <h2>Reports unavailable</h2>
            <p>{errorMessage}</p>
            <button type="button" onClick={loadProjects}>Retry</button>
          </section>
        )}

        {refreshing && projects.length > 0 && (
          <p className="reports-background-refresh" role="status">Updating report records…</p>
        )}


        <section
          className={`reports-filter-card pm-unified-filter-panel ${
            showFilters ? 'is-open' : ''
          } ${hasActiveSearch ? 'has-active-filters' : ''}`}
          aria-label="Report filters"
        >
          <div className="pm-unified-filter-bar">
            <div className="pm-unified-filter-summary">
              <span className="pm-unified-filter-icon" aria-hidden="true">
                <FilterIcon />
              </span>

              <div className="pm-unified-filter-text">
                <p>Report filters</p>
                <strong>
                  {[
                    searchTerm.trim() ? `Search: ${searchTerm.trim()}` : '',
                    programFilters.length
                      ? `Programs: ${programFilters.join(', ')}`
                      : '',
                    fundingYearFilters.length
                      ? `FY: ${fundingYearFilters.join(', ')}`
                      : '',
                    provinceFilter,
                    municipalityFilter,
                    statusFilter,
                    riskFilter,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'All AOR records'}
                </strong>
              </div>
            </div>

            <div className="pm-unified-filter-actions">
              <span>
                {hasActiveSearch ? filteredProjects.length : aorProjects.length} / {aorProjects.length}
              </span>

              <button
                type="button"
                className="pm-unified-filter-toggle"
                onClick={() => setShowFilters((current) => !current)}
                aria-expanded={showFilters}
              >
                {showFilters ? 'Hide' : 'Filter'}
              </button>
            </div>
          </div>

          <div className="pm-unified-filter-body" hidden={!showFilters}>
            <label className="pm-unified-search-field" htmlFor="reports-search">
              <SearchIcon />
              <input
                id="reports-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search project, LGU, assigned PO, latest update..."
              />
            </label>

            <div className="reports-filter-grid pm-unified-filter-grid">
              <SingleSelectFilter
                label="Province/HUC"
                value={provinceFilter}
                options={[
                  { value: '', label: 'Available Provinces/HUCs' },
                  ...provinces.map((province) => ({
                    value: province,
                    label: province,
                  })),
                ]}
                onChange={(value) => {
                  setProvinceFilter(value)
                  setMunicipalityFilter('')
                }}
              />

              <SingleSelectFilter
                label="Municipality / LGU"
                value={municipalityFilter}
                options={[
                  { value: '', label: 'Available LGUs' },
                  ...municipalities.map((municipality) => ({
                    value: municipality,
                    label: municipality,
                  })),
                ]}
                onChange={setMunicipalityFilter}
              />

              <MultiSelectFilter
                label="Program / Funding Source"
                options={programs}
                values={programFilters}
                onChange={setProgramFilters}
                allLabel="All Programs"
                commitOnDone
              />

              <MultiSelectFilter
                label="Funding Year"
                options={fundingYears}
                values={fundingYearFilters}
                onChange={setFundingYearFilters}
                allLabel="All Funding Years"
                formatOptionLabel={(year) => `FY ${year}`}
                commitOnDone
              />

              <SingleSelectFilter
                label="Status"
                value={statusFilter}
                options={[
                  { value: '', label: 'All Status' },
                  ...statuses.map((status) => ({
                    value: status,
                    label: status,
                  })),
                ]}
                onChange={setStatusFilter}
              />

              <SingleSelectFilter
                label="Risk Level"
                value={riskFilter}
                options={[
                  { value: '', label: 'All Risk Levels' },
                  ...risks.map((risk) => ({
                    value: risk,
                    label: risk,
                  })),
                ]}
                onChange={setRiskFilter}
              />

              {hasActiveSearch && (
                <button
                  type="button"
                  className="reports-clear-btn pm-unified-clear"
                  onClick={clearFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="reports-info-line pm-unified-filter-info">
              {hasActiveSearch ? (
                <>
                  <span>
                    {filteredProjects.length} project/s matched from {aorProjects.length} available AOR record/s.
                  </span>
                  <span>{activeFilterCount} active filter/s</span>
                </>
              ) : (
                <span>Available AOR records: {aorProjects.length}.</span>
              )}
            </div>
          </div>
        </section>

        {hasActiveSearch && (
          <section className="reports-table-card">
            <div className="reports-table-header">
              <div>
                <p>PROJECT BRIEFER SOURCE</p>
                <h2>Filtered Projects</h2>
                <span>
                  Showing {filteredProjects.length} matched project/s.
                </span>
                <span>
                  Program Summary Engineers: {filteredEngineersSummary}
                </span>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="reports-empty">
                <h3>No projects found</h3>
                <p>Adjust your filters or clear all filters to show available records.</p>
                <button type="button" onClick={clearFilters}>
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                {isDesktopViewport && (
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Location</th>
                        <th>Program / FY</th>
                        <th>Project Cost</th>
                        <th>Status</th>
                        <th>Risk</th>
                        <th>Progress</th>
                        <th>Project Briefer</th>
                      </tr>
                    </thead>

                    <tbody>
                      {previewProjects.map((project) => (
                        <tr key={project.id}>
                          <td>
                            <strong>{textValue(project.project_name) || 'Untitled Project'}</strong>
                            <span>{textValue(project.project_type) || 'No project type'}</span>
                          </td>
                          <td>
                            <strong>
                              {textValue(project.municipality) || 'No Municipality'}
                            </strong>
                            <span>
                              {textValue(project.barangay) || 'No Barangay'},{' '}
                              {textValue(project.province) || 'No Province'}
                            </span>
                          </td>
                          <td className="reports-program-year-cell">
                            <strong>{textValue(project.funding_source) || '—'}</strong>
                            <span>{formatFundingYear(project.funding_year)}</span>
                          </td>
                          <td>{formatCurrency(project.budget)}</td>
                          <td>
                            <span className={`reports-status ${getStatusClass(project.status)}`}>
                              {textValue(project.status) || 'No Status'}
                            </span>
                          </td>
                          <td>
                            <span className={`reports-risk ${getRiskClass(getReportRisk(project))}`}>
                              {getReportRisk(project)}
                            </span>
                          </td>
                          <td>
                            <div className="reports-progress-cell">
                              <span>
                                <strong>P</strong>
                                {formatPercent(project.physical_accomplishment)}
                              </span>
                              <span>
                                <strong>F</strong>
                                {formatPercent(project.financial_accomplishment)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="reports-briefer-btn"
                              onClick={() => void generateProjectBriefer(project)}
                              disabled={generatingBrieferId === project.id}
                            >
                              {generatingBrieferId === project.id
                                ? 'Preparing…'
                                : 'Generate Project Briefer'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}

                {!isDesktopViewport && (
                <div className="reports-mobile-list">
                  {previewProjects.map((project) => {
                    const varianceInfo = getProjectVariance(project)
                    const latestUpdateDate = formatLongDate(
                      getLatestUpdateDate(project, latestUpdateMap),
                    )

                    return (
                      <article key={project.id} className="reports-mobile-card">
                        <div>
                          <h3>{textValue(project.project_name) || 'Untitled Project'}</h3>
                          <p>
                            {textValue(project.barangay) || 'No Barangay'},{' '}
                            {textValue(project.municipality) || 'No Municipality'},{' '}
                            {textValue(project.province) || 'No Province'}
                          </p>
                        </div>

                        <div className="reports-mobile-badges">
                          <span className={`reports-status ${getStatusClass(project.status)}`}>
                            {textValue(project.status) || 'No Status'}
                          </span>
                          <span className={`reports-risk ${getRiskClass(getReportRisk(project))}`}>
                            {getReportRisk(project)}
                          </span>
                        </div>

                        <div className="reports-mobile-grid">
                          <span>
                            <strong>AOR</strong>
                            {getAssignedAorLabel(project)}
                          </span>
                          <span>
                            <strong>Latest Update Date</strong>
                            {latestUpdateDate}
                          </span>
                          <span>
                            <strong>Funding</strong>
                            {textValue(project.funding_source) || '-'}
                          </span>
                          <span>
                            <strong>Cost</strong>
                            {formatCurrency(project.budget)}
                          </span>
                          <span>
                            <strong>Actual</strong>
                            {formatPercent(varianceInfo.actualPhysical)}
                          </span>
                          <span>
                            <strong>Target</strong>
                            {formatPercent(varianceInfo.targetPhysical)}
                          </span>
                          <span>
                            <strong>Variance</strong>
                            <em className={`reports-variance ${varianceInfo.className}`}>
                              {formatSignedVariance(varianceInfo.variance)}
                            </em>
                          </span>
                          <span>
                            <strong>Financial</strong>
                            {formatPercent(project.financial_accomplishment)}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="reports-briefer-btn reports-briefer-btn-mobile"
                          onClick={() => void generateProjectBriefer(project)}
                          disabled={generatingBrieferId === project.id}
                        >
                          {generatingBrieferId === project.id ? 'Preparing Project Briefer…' : 'Generate Project Briefer'}
                        </button>
                      </article>
                    )
                  })}
                </div>
                )}

                {filteredProjects.length > previewProjects.length && (
                  <p className="reports-preview-limit">
                    Previewing {previewProjects.length} of {filteredProjects.length} matched projects.
                    PDF and Excel exports still include all {filteredProjects.length} matched projects.
                  </p>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {portalReady && createPortal(reportsFabStack, document.body)}
    </>
  )
}
