import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { filterProjectsByAor } from '../utils/aorAccess'
import { normalizeProgramName } from '../utils/program'
import { getPmsRiskLevel } from '../utils/projectStatus'
import {
  formatSignedVariance,
  getTargetPhysicalInfo,
} from '../utils/projectVariance'
import '../styles/reports.css'
import '../styles/pageHero.css'

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

type ProjectUpdateLookupRow = {
  id?: string | number | null
  project_id: string | null
  engineer_id: string | null
  inspection_date: string | null
  created_at: string | null
}

type LatestUpdateInfo = {
  engineer_id: string | null
  inspection_date: string | null
  created_at: string | null
}

type ProfileLookupMap = Record<string, ProfileLookupRow>
type LatestUpdateMap = Record<string, LatestUpdateInfo>

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

function cleanFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase()
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
  return sameText(project.province, province)
}

function reportProjectMatchesMunicipality(project: ProjectRow, municipality: unknown) {
  return sameText(project.municipality, municipality)
}

function getStrictReportAorProjects(projects: ProjectRow[], auth: ReturnType<typeof useAuth>) {
  const profile = auth.profile

  if (!profile || profile.approved !== true || profile.is_active === false) return []

  const role = getCanonicalReportRole(profile.role)

  if (auth.isAdmin || role === 'Admin' || role === 'RD' || role === 'ARD' || role === 'PDMU Chief') {
    return projects
  }

  if (auth.isROEngineer || role === 'RO Engineer') {
    const assignments = (auth.roEngineerProvinceAssignments || []).filter(
      (assignment) => assignment.is_active !== false,
    )

    if (assignments.length > 0) {
      return projects.filter((project) =>
        assignments.some((assignment) =>
          reportProjectMatchesProvince(project, assignment.province),
        ),
      )
    }

    return projects.filter((project) =>
      reportProjectMatchesProvince(project, profile.province),
    )
  }

  if (auth.isPOEngineer || auth.isEngineer || role === 'PO Engineer') {
    const assignments = (auth.poEngineerLguAssignments || []).filter(
      (assignment) => assignment.is_active !== false,
    )

    if (assignments.length > 0) {
      return projects.filter((project) =>
        assignments.some(
          (assignment) =>
            reportProjectMatchesProvince(project, assignment.province) &&
            reportProjectMatchesMunicipality(project, assignment.municipality),
        ),
      )
    }

    return projects.filter(
      (project) =>
        reportProjectMatchesProvince(project, profile.province) &&
        reportProjectMatchesMunicipality(project, profile.municipality),
    )
  }

  if (auth.isPD || auth.isPEO || role === 'PD' || role === 'PEO') {
    return projects.filter((project) =>
      reportProjectMatchesProvince(project, profile.province),
    )
  }

  if (auth.isCD || role === 'CD') {
    return projects.filter((project) =>
      reportProjectMatchesMunicipality(project, profile.huc),
    )
  }

  if (auth.isCLGOO || role === 'CLGOO') {
    return projects.filter((project) =>
      reportProjectMatchesMunicipality(project, profile.city),
    )
  }

  if (auth.isMLGOO || role === 'MLGOO') {
    return projects.filter((project) =>
      reportProjectMatchesMunicipality(project, profile.municipality),
    )
  }

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
    return uniqueSortedTextValues(aorProjects.map((project) => project.province))
  }

  if (auth.isROEngineer || role === 'RO Engineer') {
    const assignments = getActiveReportRoAssignments(auth)
    const assignedProvinces = uniqueSortedTextValues(
      assignments.map((assignment) => assignment.province),
    )

    return assignedProvinces.length > 0
      ? assignedProvinces
      : uniqueSortedTextValues([profile.province])
  }

  if (auth.isPOEngineer || auth.isEngineer || role === 'PO Engineer') {
    const assignments = getActiveReportPoAssignments(auth)
    const assignedProvinces = uniqueSortedTextValues(
      assignments.map((assignment) => assignment.province),
    )

    return assignedProvinces.length > 0
      ? assignedProvinces
      : uniqueSortedTextValues([profile.province])
  }

  if (auth.isPD || auth.isPEO || role === 'PD' || role === 'PEO') {
    return uniqueSortedTextValues([profile.province])
  }

  const aorProjectProvinces = uniqueSortedTextValues(
    aorProjects.map((project) => project.province),
  )

  if (aorProjectProvinces.length > 0) return aorProjectProvinces

  return uniqueSortedTextValues([profile.province])
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
    const assignments = getActiveReportPoAssignments(auth)
    const assignedMunicipalities = uniqueSortedTextValues(
      assignments
        .filter((assignment) =>
          provinceFilter ? sameText(assignment.province, provinceFilter) : true,
        )
        .map((assignment) => assignment.municipality),
    )

    return assignedMunicipalities.length > 0
      ? assignedMunicipalities
      : uniqueSortedTextValues([profile.municipality])
  }

  if (auth.isCD || role === 'CD') {
    return uniqueSortedTextValues([profile.huc])
  }

  if (auth.isCLGOO || role === 'CLGOO') {
    return uniqueSortedTextValues([profile.city])
  }

  if (auth.isMLGOO || role === 'MLGOO') {
    return uniqueSortedTextValues([profile.municipality])
  }

  return uniqueSortedTextValues(
    aorProjects
      .filter((project) =>
        provinceFilter ? sameText(project.province, provinceFilter) : true,
      )
      .map((project) => project.municipality),
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

function getReportAssignedPoSummary(
  projects: ProjectRow[],
  assignments: PoEngineerAssignmentRow[],
  profileMap: ProfileLookupMap,
) {
  const assignedNames = uniqueTextValues(
    projects.flatMap((project) =>
      getAssignedPoEngineersForProject(project, assignments, profileMap)
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name && name !== 'No assigned PO Engineer'),
    ),
  )

  return assignedNames.length > 0 ? assignedNames.join(', ') : 'No assigned PO Engineer'
}

function getReportAorSummary(projects: ProjectRow[]) {
  const aorLabels = uniqueTextValues(projects.map((project) => getAssignedAorLabel(project)))

  if (aorLabels.length === 0) return 'No AOR records'
  if (aorLabels.length <= 3) return aorLabels.join('; ')

  return `${aorLabels.slice(0, 3).join('; ')}; and ${aorLabels.length - 3} more AOR/s`
}

function compactReportHeaderText(value: string, maxLength = 210) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function getAssignedAorLabel(project: ProjectRow) {
  const province = textValue(project.province) || 'No province'
  const lgu = textValue(project.municipality) || 'No LGU'

  return `${province} / ${lgu}`
}

function getLatestUpdateForProject(project: ProjectRow, latestUpdateMap: LatestUpdateMap) {
  return latestUpdateMap[project.id] || null
}

function getLatestUpdateDate(project: ProjectRow, latestUpdateMap: LatestUpdateMap) {
  const latestUpdate = getLatestUpdateForProject(project, latestUpdateMap)

  return latestUpdate?.inspection_date || latestUpdate?.created_at || project.last_inspection_date || null
}

function getComparableUpdateTime(update: ProjectUpdateLookupRow) {
  const rawDate = update.inspection_date || update.created_at || ''
  const parsed = new Date(rawDate.length <= 10 ? `${rawDate}T00:00:00` : rawDate)

  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Z" />
      <path d="m16.1 16.1 4.4 4.4" />
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
  const auth = useAuth()

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [poEngineerAssignments, setPoEngineerAssignments] = useState<PoEngineerAssignmentRow[]>([])
  const [profileMap, setProfileMap] = useState<ProfileLookupMap>({})
  const [latestUpdateMap, setLatestUpdateMap] = useState<LatestUpdateMap>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [isReportsScrolled, setIsReportsScrolled] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('')
  const [municipalityFilter, setMunicipalityFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    loadProjects()
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
    try {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error

      const loadedProjects = (data || []) as ProjectRow[]
      setProjects(loadedProjects)

      await loadReportReferenceData()
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load report data. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function loadReportReferenceData() {
    const [assignmentsResult, updatesResult] = await Promise.all([
      supabase
        .from('po_engineer_lgu_assignments')
        .select('id, user_id, province, municipality, is_active')
        .eq('is_active', true),
      supabase
        .from('project_updates')
        .select('id, project_id, engineer_id, inspection_date, created_at')
        .order('inspection_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    const loadedAssignments = assignmentsResult.error
      ? []
      : ((assignmentsResult.data || []) as PoEngineerAssignmentRow[])
    const loadedUpdates = updatesResult.error
      ? []
      : ((updatesResult.data || []) as ProjectUpdateLookupRow[])

    if (assignmentsResult.error) {
      console.error('Report PO Engineer assignment load error:', assignmentsResult.error.message)
    }

    if (updatesResult.error) {
      console.error('Report latest update load error:', updatesResult.error.message)
    }

    setPoEngineerAssignments(loadedAssignments)

    const latestMap: LatestUpdateMap = {}

    loadedUpdates.forEach((update) => {
      if (!update.project_id) return

      const currentLatest = latestMap[update.project_id]

      if (!currentLatest) {
        latestMap[update.project_id] = {
          engineer_id: update.engineer_id,
          inspection_date: update.inspection_date,
          created_at: update.created_at,
        }
        return
      }

      const nextTime = getComparableUpdateTime(update)
      const currentTime = getComparableUpdateTime({
        project_id: update.project_id,
        engineer_id: currentLatest.engineer_id,
        inspection_date: currentLatest.inspection_date,
        created_at: currentLatest.created_at,
      })

      if (nextTime > currentTime) {
        latestMap[update.project_id] = {
          engineer_id: update.engineer_id,
          inspection_date: update.inspection_date,
          created_at: update.created_at,
        }
      }
    })

    setLatestUpdateMap(latestMap)

    const profileIds = uniqueTextValues([
      ...loadedAssignments.map((assignment) => assignment.user_id),
      ...loadedUpdates.map((update) => update.engineer_id),
    ])

    if (profileIds.length === 0) {
      setProfileMap({})
      return
    }

    const profilesResult = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approved, is_active')
      .in('id', profileIds)

    if (profilesResult.error) {
      console.error('Report user profile lookup error:', profilesResult.error.message)
      setProfileMap({})
      return
    }

    const nextProfileMap = ((profilesResult.data || []) as ProfileLookupRow[]).reduce<ProfileLookupMap>(
      (map, profile) => {
        map[profile.id] = profile
        return map
      },
      {},
    )

    setProfileMap(nextProfileMap)
  }

  function clearFilters() {
    setSearchTerm('')
    setProvinceFilter('')
    setMunicipalityFilter('')
    setProgramFilter('')
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
          .map((project) => normalizeProgramName(textValue(project.funding_source || project.project_type)))
          .filter(Boolean),
      ),
    ).sort()
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

    if (programFilter && !programs.includes(programFilter)) {
      setProgramFilter('')
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
    programFilter,
    programs,
    statusFilter,
    statuses,
    riskFilter,
    risks,
  ])

  const filteredProjects = useMemo(() => {
    return aorProjects.filter((project) => {
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
        getReportRisk(project),
        project.contractor,
        project.implementing_office,
        assignedPoEngineers,
        latestUpdateDate,
      ]
        .map(textValue)
        .join(' ')
        .toLowerCase()

      const searchMatches = searchTerm.trim()
        ? searchableText.includes(searchTerm.trim().toLowerCase())
        : true

      const provinceMatches = provinceFilter
        ? sameText(project.province, provinceFilter)
        : true

      const municipalityMatches = municipalityFilter
        ? sameText(project.municipality, municipalityFilter)
        : true

      const programMatches = programFilter
        ? normalizeProgramName(textValue(project.funding_source || project.project_type)) === programFilter
        : true

      const statusMatches = statusFilter
        ? textValue(project.status) === statusFilter
        : true

      const riskMatches = riskFilter
        ? getReportRisk(project) === riskFilter
        : true

      return (
        searchMatches &&
        provinceMatches &&
        municipalityMatches &&
        programMatches &&
        statusMatches &&
        riskMatches
      )
    })
  }, [
    aorProjects,
    poEngineerAssignments,
    profileMap,
    latestUpdateMap,
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    statusFilter,
    riskFilter,
  ])

  const activeFilterCount = [
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    statusFilter,
    riskFilter,
  ].filter(Boolean).length

  const hasActiveSearch = activeFilterCount > 0
  const reportProjects = hasActiveSearch ? filteredProjects : aorProjects

  function generatePdfReport() {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    const generatedDate = formatLongDate(new Date().toISOString())
    const title = 'DILG-PDMU Project Monitoring Report'

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(title, 14, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Department of the Interior and Local Government Region X', 14, 22)
    doc.text('Project Development and Management Unit', 14, 27)
    doc.text(`Generated: ${generatedDate}`, 14, 32)
    let headerY = 37
    doc.text('Scope: Records are filtered according to the logged-in user AOR.', 14, headerY)

    const assignedPoSummary = compactReportHeaderText(
      getReportAssignedPoSummary(reportProjects, poEngineerAssignments, profileMap),
    )
    const assignedAorSummary = compactReportHeaderText(getReportAorSummary(reportProjects))

    headerY += 5
    doc.text(`Assigned PO Engineer/s: ${assignedPoSummary}`, 14, headerY)
    headerY += 5
    doc.text(`Assigned AOR: ${assignedAorSummary}`, 14, headerY)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    headerY += 7
    doc.text(`Projects Included: ${reportProjects.length}`, 14, headerY)

    autoTable(doc, {
      startY: headerY + 7,
      margin: { left: 10, right: 10 },
      tableWidth: 'auto',
      head: [
        [
          'Project',
          'Province',
          'LGU',
          'Funding',
          'Cost',
          'Status',
          'Risk',
          'Actual',
          'Target',
          'Variance',
          'Financial',
          'Latest Update',
        ],
      ],
      body: reportProjects.map((project) => {
        const varianceInfo = getProjectVariance(project)

        return [
          textValue(project.project_name) || 'Untitled Project',
          textValue(project.province) || '-',
          textValue(project.municipality) || '-',
          normalizeProgramName(project.funding_source || project.project_type) || '-',
          formatCurrency(project.budget),
          textValue(project.status) || '-',
          getReportRisk(project),
          formatPercent(varianceInfo.actualPhysical),
          formatPercent(varianceInfo.targetPhysical),
          formatSignedVariance(varianceInfo.variance),
          formatPercent(project.financial_accomplishment),
          formatLongDate(getLatestUpdateDate(project, latestUpdateMap)),
        ]
      }),
      styles: {
        fontSize: 5.8,
        cellPadding: 1.1,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [11, 55, 105],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
      columnStyles: {
        0: { cellWidth: 44 },
        1: { cellWidth: 20 },
        2: { cellWidth: 20 },
        3: { cellWidth: 30 },
        4: { cellWidth: 22 },
        5: { cellWidth: 20 },
        6: { cellWidth: 15 },
        7: { cellWidth: 14 },
        8: { cellWidth: 14 },
        9: { cellWidth: 16 },
        10: { cellWidth: 17 },
        11: { cellWidth: 24 },
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages()
        const pageSize = doc.internal.pageSize
        const pageWidth = pageSize.getWidth()
        const pageHeight = pageSize.getHeight()

        doc.setFontSize(8)
        doc.setTextColor(100)
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`,
          pageWidth - 34,
          pageHeight - 8,
        )
      },
    })

    doc.save(`${cleanFilename(title)}.pdf`)
  }

  function exportExcelReport() {
    const rows = reportProjects.map((project) => {
      const varianceInfo = getProjectVariance(project)

      return {
        Project: textValue(project.project_name) || 'Untitled Project',
        Description: textValue(project.description),
        Province: textValue(project.province),
        Municipality: textValue(project.municipality),
        Barangay: textValue(project.barangay),
        'Assigned Province / AOR': getAssignedAorLabel(project),
        'Latest Update Date': formatLongDate(getLatestUpdateDate(project, latestUpdateMap)),
        'Funding Source': textValue(project.funding_source),
        'Project Type': textValue(project.project_type),
        'Implementing Office': textValue(project.implementing_office),
        Contractor: textValue(project.contractor),
        'Project Cost': toNumber(project.budget),
        Status: textValue(project.status),
        'Risk Level': getReportRisk(project),
        'Actual Physical': Number(varianceInfo.actualPhysical.toFixed(2)),
        'Target Physical': Number(varianceInfo.targetPhysical.toFixed(2)),
        Variance: Number(varianceInfo.variance.toFixed(2)),
        'Financial Accomplishment': toNumber(project.financial_accomplishment),
        'Start Date': formatLongDate(project.start_date),
        'Target Completion Date': formatLongDate(project.target_completion_date),
        'Last Inspection Date': formatLongDate(project.last_inspection_date),
        Latitude: textValue(project.latitude),
        Longitude: textValue(project.longitude),
      }
    })

    const summaryRows = [
      ['DILG-PDMU Project Monitoring Report'],
      ['Generated', formatLongDate(new Date().toISOString())],
      ['Scope', 'Records are filtered according to the logged-in user AOR.'],
      [
        'Assigned PO Engineer/s',
        getReportAssignedPoSummary(reportProjects, poEngineerAssignments, profileMap),
      ],
      ['Assigned AOR', getReportAorSummary(reportProjects)],
      ['Projects Included', reportProjects.length],
      ['Active Filters', activeFilterCount],
      [],
    ]

    const workbook = XLSX.utils.book_new()
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
    const dataSheet = XLSX.utils.json_to_sheet(rows)

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Projects')

    XLSX.writeFile(workbook, 'dilg-pdmu-project-monitoring-report.xlsx')
  }

  const reportsFabStack = (
    <div className="reports-fab-stack" aria-label="Report actions">
      <button
        type="button"
        className="reports-fab reports-fab-excel"
        onClick={exportExcelReport}
        disabled={loading || aorProjects.length === 0}
        aria-label="Export Excel"
        title="Export Excel"
      >
        <ExcelIcon />
      </button>

      <button
        type="button"
        className="reports-fab reports-fab-pdf"
        onClick={generatePdfReport}
        disabled={loading || aorProjects.length === 0}
        aria-label="Generate PDF"
        title="Generate PDF"
      >
        <PdfIcon />
      </button>
    </div>
  )

  if (loading) {
    return (
      <div className="reports-page">
        <div className="reports-loading-card">
          <div className="reports-loader" />
          <h2>Loading Reports</h2>
          <p>Preparing project monitoring data...</p>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="reports-page">
        <div className="reports-error-card">
          <h2>Reports Error</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={loadProjects}>
            Reload Reports
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`reports-page ${isReportsScrolled ? 'is-reports-scrolled' : ''}`}>
        <section className="reports-hero">
          <div>
            <p className="reports-eyebrow">Reports Module</p>
            <h1>Project Reports</h1>
            <p>
              Generate project monitoring reports by province, LGU, funding source,
              implementation status, and risk level.
            </p>
          </div>
        </section>

        <section className="reports-filter-card">
          <div className="reports-search-row">
            <label className="reports-search-field" htmlFor="reports-search">
              <SearchIcon />
              <input
                id="reports-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search project, LGU, assigned PO, latest update..."
              />
            </label>

            <button
              type="button"
              className={`reports-filter-button ${showFilters ? 'is-active' : ''}`}
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
              aria-label="Show report filters"
              title="Show report filters"
            >
              <FilterIcon />
              <span>Filter</span>
            </button>
          </div>

          {showFilters && (
            <div className="reports-filter-grid">
              <label>
                <span>Province</span>
                <select
                  value={provinceFilter}
                  onChange={(event) => {
                    setProvinceFilter(event.target.value)
                    setMunicipalityFilter('')
                  }}
                >
                  <option value="">Available Provinces</option>
                  {provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Municipality / LGU</span>
                <select
                  value={municipalityFilter}
                  onChange={(event) => setMunicipalityFilter(event.target.value)}
                >
                  <option value="">Available LGUs</option>
                  {municipalities.map((municipality) => (
                    <option key={municipality} value={municipality}>
                      {municipality}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Program / Funding Source</span>
                <select
                  value={programFilter}
                  onChange={(event) => setProgramFilter(event.target.value)}
                >
                  <option value="">All Programs</option>
                  {programs.map((program) => (
                    <option key={String(program).toUpperCase()} value={String(program).toUpperCase()}>
                      {String(program).toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="">All Status</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Risk Level</span>
                <select
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value)}
                >
                  <option value="">All Risk Levels</option>
                  {risks.map((risk) => (
                    <option key={risk} value={risk}>
                      {risk}
                    </option>
                  ))}
                </select>
              </label>

              {hasActiveSearch && (
                <button
                  type="button"
                  className="reports-clear-btn"
                  onClick={clearFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          <div className="reports-info-line">
            {hasActiveSearch ? (
              <>
                <span>
                  {filteredProjects.length} project/s matched from {aorProjects.length} available AOR record/s.
                </span>

                <span>
                  {activeFilterCount} active filter/s
                </span>
              </>
            ) : (
              <span>
                Search or use the filter button to display report records. Available AOR records: {aorProjects.length}.
              </span>
            )}
          </div>
        </section>

        {hasActiveSearch && (
          <section className="reports-table-card">
            <div className="reports-table-header">
              <div>
                <p>REPORT DATA</p>
                <h2>Search Results</h2>
                <span>
                  Showing {filteredProjects.length} matched project/s.
                </span>
                <span>
                  Assigned PO Engineer/s: {getReportAssignedPoSummary(filteredProjects, poEngineerAssignments, profileMap)}
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
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Location</th>
                        <th>Latest Update</th>
                        <th>Funding Source</th>
                        <th>Project Cost</th>
                        <th>Status</th>
                        <th>Risk</th>
                        <th>Actual</th>
                        <th>Target</th>
                        <th>Variance</th>
                        <th>Financial</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredProjects.map((project) => {
                        const varianceInfo = getProjectVariance(project)
                        const latestUpdateDate = formatLongDate(
                          getLatestUpdateDate(project, latestUpdateMap),
                        )

                        return (
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
                              <span>{getAssignedAorLabel(project)}</span>
                            </td>
                            <td>
                              <strong>{latestUpdateDate}</strong>
                            </td>
                            <td>{textValue(project.funding_source) || '-'}</td>
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
                            <td>{formatPercent(varianceInfo.actualPhysical)}</td>
                            <td>{formatPercent(varianceInfo.targetPhysical)}</td>
                            <td>
                              <span className={`reports-variance ${varianceInfo.className}`}>
                                {formatSignedVariance(varianceInfo.variance)}
                              </span>
                            </td>
                            <td>{formatPercent(project.financial_accomplishment)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="reports-mobile-list">
                  {filteredProjects.map((project) => {
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
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {portalReady && createPortal(reportsFabStack, document.body)}
    </>
  )
}
