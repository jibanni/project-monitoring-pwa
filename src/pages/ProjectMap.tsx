import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getComputedRiskLevel, getTargetPhysicalInfo } from '../utils/projectVariance'
import '../styles/projectMap.css'
import '../styles/pageHero.css'

const MINDANAO_BOUNDS = {
  minLat: 4,
  maxLat: 10.8,
  minLng: 119,
  maxLng: 127.8,
}

const MINDANAO_CENTER: [number, number] = [7.8, 124.8]
const DEFAULT_ZOOM = 7

const REGION_10_BOUNDS: [[number, number], [number, number]] = [
  [7.15, 123.25],
  [9.75, 125.85],
]

type ProjectRecord = {
  id: string
  project_name: string | null
  description: string | null
  status: string | null
  project_type: string | null
  funding_source: string | null
  implementing_office: string | null
  contractor: string | null
  budget: number | null
  start_date: string | null
  target_completion_date: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  latitude: number | string | null
  longitude: number | string | null
  physical_accomplishment: number | null
  financial_accomplishment: number | null
  risk_level: string | null
  last_inspection_date: string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  updated_at: string | null
}

type ProjectUpdateRecord = {
  id: string
  project_id: string
  inspection_date: string | null
  inspection_latitude: number | string | null
  inspection_longitude: number | string | null
  created_at: string | null
}

type CoordinateSource = 'project' | 'update' | 'none'

type MapProject = ProjectRecord & {
  displayLatitude: number | null
  displayLongitude: number | null
  coordinateSource: CoordinateSource
  coordinateLabel: string
  coordinateDate: string | null
  latestUpdateGps: ProjectUpdateRecord | null
  coordinateIssue: string | null
}

type CoordinateCandidate = {
  latitude: number
  longitude: number
  source: CoordinateSource
  label: string
  date: string | null
  timestamp: number
  latestUpdateGps: ProjectUpdateRecord | null
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0

  const parsed = new Date(value).getTime()

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeText(value: string | null | undefined) {
  return (value || '').trim()
}

function isValidMindanaoCoordinate(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return false
  if (latitude === 0 && longitude === 0) return false

  return (
    latitude >= MINDANAO_BOUNDS.minLat &&
    latitude <= MINDANAO_BOUNDS.maxLat &&
    longitude >= MINDANAO_BOUNDS.minLng &&
    longitude <= MINDANAO_BOUNDS.maxLng
  )
}

function getBestUpdateGps(updates: ProjectUpdateRecord[]) {
  const validUpdates = updates
    .map((update) => {
      const latitude = toNumber(update.inspection_latitude)
      const longitude = toNumber(update.inspection_longitude)

      return {
        update,
        latitude,
        longitude,
        timestamp: toTimestamp(update.created_at || update.inspection_date),
      }
    })
    .filter((item) => isValidMindanaoCoordinate(item.latitude, item.longitude))
    .sort((a, b) => b.timestamp - a.timestamp)

  return validUpdates[0] || null
}

function getCoordinateIssue(project: ProjectRecord, latestUpdateGps: ProjectUpdateRecord | null) {
  const projectLatitude = toNumber(project.latitude)
  const projectLongitude = toNumber(project.longitude)

  const updateLatitude = toNumber(latestUpdateGps?.inspection_latitude)
  const updateLongitude = toNumber(latestUpdateGps?.inspection_longitude)

  const hasProjectGps = projectLatitude !== null || projectLongitude !== null
  const hasUpdateGps = updateLatitude !== null || updateLongitude !== null

  if (!hasProjectGps && !hasUpdateGps) {
    return 'No project GPS or inspection GPS has been recorded.'
  }

  if (hasProjectGps && !isValidMindanaoCoordinate(projectLatitude, projectLongitude)) {
    return 'Saved project GPS is incomplete, invalid, or outside Mindanao.'
  }

  if (hasUpdateGps && !isValidMindanaoCoordinate(updateLatitude, updateLongitude)) {
    return 'Latest inspection GPS is incomplete, invalid, or outside Mindanao.'
  }

  return 'No usable coordinate found.'
}

function buildMapProject(
  project: ProjectRecord,
  projectUpdates: ProjectUpdateRecord[],
): MapProject {
  const projectLatitude = toNumber(project.latitude)
  const projectLongitude = toNumber(project.longitude)
  const latestValidUpdate = getBestUpdateGps(projectUpdates)

  const candidates: CoordinateCandidate[] = []

  if (isValidMindanaoCoordinate(projectLatitude, projectLongitude)) {
    candidates.push({
      latitude: projectLatitude as number,
      longitude: projectLongitude as number,
      source: 'project',
      label: 'Project GPS',
      date: project.updated_at,
      timestamp: toTimestamp(project.updated_at),
      latestUpdateGps: null,
    })
  }

  if (latestValidUpdate) {
    candidates.push({
      latitude: latestValidUpdate.latitude as number,
      longitude: latestValidUpdate.longitude as number,
      source: 'update',
      label: 'Latest Update GPS',
      date: latestValidUpdate.update.created_at || latestValidUpdate.update.inspection_date,
      timestamp: latestValidUpdate.timestamp,
      latestUpdateGps: latestValidUpdate.update,
    })
  }

  const latestCoordinate = candidates.sort((a, b) => b.timestamp - a.timestamp)[0]

  if (latestCoordinate) {
    return {
      ...project,
      displayLatitude: latestCoordinate.latitude,
      displayLongitude: latestCoordinate.longitude,
      coordinateSource: latestCoordinate.source,
      coordinateLabel: latestCoordinate.label,
      coordinateDate: latestCoordinate.date,
      latestUpdateGps: latestCoordinate.latestUpdateGps,
      coordinateIssue: null,
    }
  }

  const newestUpdate =
    [...projectUpdates].sort(
      (a, b) =>
        toTimestamp(b.created_at || b.inspection_date) -
        toTimestamp(a.created_at || a.inspection_date),
    )[0] || null

  return {
    ...project,
    displayLatitude: null,
    displayLongitude: null,
    coordinateSource: 'none',
    coordinateLabel: 'No Valid GPS',
    coordinateDate: null,
    latestUpdateGps: newestUpdate,
    coordinateIssue: getCoordinateIssue(project, newestUpdate),
  }
}

function formatPhpCompact(value: number | null | undefined) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) return 'Php 0'

  if (amount >= 1_000_000_000) {
    return `Php ${(amount / 1_000_000_000).toFixed(2)}B`
  }

  if (amount >= 1_000_000) {
    return `Php ${(amount / 1_000_000).toFixed(2)}M`
  }

  if (amount >= 1_000) {
    return `Php ${(amount / 1_000).toFixed(2)}K`
  }

  return `Php ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPhpFull(value: number | null | undefined) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) return 'Php 0.00'

  return `Php ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: number | null | undefined) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount)) return '0%'

  return `${Math.min(100, Math.max(0, amount)).toLocaleString('en-PH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`
}

function getProjectLocation(project: ProjectRecord) {
  const parts = [
    normalizeText(project.barangay),
    normalizeText(project.municipality),
    normalizeText(project.province),
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'Location not specified'
}

function getRiskClass(riskLevel: string | null | undefined) {
  const risk = normalizeText(riskLevel).toLowerCase()

  if (risk.includes('high')) return 'pm-risk-high'
  if (risk.includes('moderate')) return 'pm-risk-moderate'
  if (risk.includes('low')) return 'pm-risk-low'

  return 'pm-risk-neutral'
}

function getStatusClass(status: string | null | undefined) {
  const value = normalizeText(status).toLowerCase()

  if (value.includes('completed')) return 'pm-status-completed'
  if (value.includes('ongoing')) return 'pm-status-ongoing'
  if (value.includes('not yet') || value.includes('not started')) {
    return 'pm-status-not-started'
  }
  if (value.includes('suspended')) return 'pm-status-suspended'
  if (value.includes('cancelled') || value.includes('terminated')) {
    return 'pm-status-cancelled'
  }

  return 'pm-status-neutral'
}

function createProjectMarker(project: MapProject) {
  const risk = getComputedRiskLevel(project).toLowerCase()

  let markerClass = 'pm-marker-neutral'

  if (risk.includes('low')) markerClass = 'pm-marker-low'
  if (risk.includes('moderate')) markerClass = 'pm-marker-moderate'
  if (risk.includes('high')) markerClass = 'pm-marker-high'

  return L.divIcon({
    className: 'pm-marker-wrapper',
    html: `
      <div class="pm-marker ${markerClass}">
        <span></span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Z" />
      <path d="m16.1 16.1 4.4 4.4" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4v6h-6" />
    </svg>
  )
}

function RefocusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.4" />
    </svg>
  )
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 10V4h6" />
      <path d="M14 4h6v6" />
      <path d="M20 14v6h-6" />
      <path d="M10 20H4v-6" />
    </svg>
  )
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M20 15h-5v5" />
      <path d="M4 15h5v5" />
    </svg>
  )
}

function focusMapToProjectSet(map: L.Map, projects: MapProject[]) {
  map.invalidateSize()

  const validProjects = projects.filter(
    (project) => project.displayLatitude !== null && project.displayLongitude !== null,
  )

  if (validProjects.length === 0) {
    map.fitBounds(REGION_10_BOUNDS, {
      padding: [28, 28],
      maxZoom: 9,
    })
    return
  }

  if (validProjects.length === 1) {
    const project = validProjects[0]

    map.setView(
      [project.displayLatitude as number, project.displayLongitude as number],
      13,
    )
    return
  }

  const bounds = L.latLngBounds(
    validProjects.map((project) => [
      project.displayLatitude as number,
      project.displayLongitude as number,
    ]),
  )

  map.fitBounds(bounds, {
    padding: [38, 38],
    maxZoom: 13,
  })
}

function FitMapToMarkers({
  projects,
  focusSignal,
}: {
  projects: MapProject[]
  focusSignal: number
}) {
  const map = useMap()

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      focusMapToProjectSet(map, projects)
    }, 180)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [map, projects, focusSignal])

  return null
}

function MapResizeWatcher({ trigger }: { trigger: unknown }) {
  const map = useMap()

  useEffect(() => {
    const resizeMap = () => {
      map.invalidateSize()
    }

    resizeMap()

    const timeoutOne = window.setTimeout(resizeMap, 160)
    const timeoutTwo = window.setTimeout(resizeMap, 520)
    const timeoutThree = window.setTimeout(resizeMap, 1000)

    const container = map.getContainer()
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => resizeMap())
        : null

    observer?.observe(container)

    window.addEventListener('resize', resizeMap)
    window.addEventListener('orientationchange', resizeMap)
    window.visualViewport?.addEventListener('resize', resizeMap)

    return () => {
      window.clearTimeout(timeoutOne)
      window.clearTimeout(timeoutTwo)
      window.clearTimeout(timeoutThree)
      observer?.disconnect()
      window.removeEventListener('resize', resizeMap)
      window.removeEventListener('orientationchange', resizeMap)
      window.visualViewport?.removeEventListener('resize', resizeMap)
    }
  }, [map, trigger])

  return null
}

export default function ProjectMap() {
  const { isAdmin, isEngineer } = useAuth()

  const [projects, setProjects] = useState<MapProject[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [updateGpsWarning, setUpdateGpsWarning] = useState('')
  const [isHeroCompact, setIsHeroCompact] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [focusSignal, setFocusSignal] = useState(0)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('All')
  const [municipalityFilter, setMunicipalityFilter] = useState('All')
  const [programFilter, setProgramFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [riskFilter, setRiskFilter] = useState('All')

  const canUpdateProject = isAdmin || isEngineer

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    loadMapProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true

      window.requestAnimationFrame(() => {
        setIsHeroCompact(window.scrollY > 28)
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
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMapFullscreen(false)
      }
    }

    if (isMapFullscreen) {
      document.body.classList.add('pm-map-fullscreen-lock')
    } else {
      document.body.classList.remove('pm-map-fullscreen-lock')
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.classList.remove('pm-map-fullscreen-lock')
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isMapFullscreen])

  async function loadMapProjects(isManualRefresh = false) {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setLoadError('')
    setUpdateGpsWarning('')

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select(
        `
          id,
          project_name,
          description,
          status,
          project_type,
          funding_source,
          implementing_office,
          contractor,
          budget,
          start_date,
          target_completion_date,
          barangay,
          municipality,
          province,
          latitude,
          longitude,
          physical_accomplishment,
          financial_accomplishment,
          target_physical_accomplishment,
          target_physical_as_of,
          target_physical_source,
          risk_level,
          last_inspection_date,
          updated_at
        `,
      )
      .order('updated_at', { ascending: false })

    if (projectError) {
      setLoadError(projectError.message || 'Unable to load project map records.')
      setProjects([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const { data: updateData, error: updateError } = await supabase
      .from('project_updates')
      .select(
        `
          id,
          project_id,
          inspection_date,
          inspection_latitude,
          inspection_longitude,
          created_at
        `,
      )
      .order('created_at', { ascending: false })

    if (updateError) {
      setUpdateGpsWarning(
        updateError.message ||
          'Project records loaded, but latest inspection GPS records could not be loaded.',
      )
    }

    const updatesByProject = new Map<string, ProjectUpdateRecord[]>()

    ;((updateData || []) as ProjectUpdateRecord[]).forEach((update) => {
      const currentUpdates = updatesByProject.get(update.project_id) || []
      currentUpdates.push(update)
      updatesByProject.set(update.project_id, currentUpdates)
    })

    const mappedProjects = ((projectData || []) as ProjectRecord[]).map((project) =>
      buildMapProject(project, updatesByProject.get(project.id) || []),
    )

    setProjects(mappedProjects)
    setLoading(false)
    setRefreshing(false)
  }

  const filterOptions = useMemo(() => {
    const provinces = new Set<string>()
    const municipalities = new Set<string>()
    const programs = new Set<string>()
    const statuses = new Set<string>()
    const risks = new Set<string>()

    projects.forEach((project) => {
      if (normalizeText(project.province)) provinces.add(normalizeText(project.province))
      if (normalizeText(project.municipality)) {
        municipalities.add(normalizeText(project.municipality))
      }
      if (normalizeText(project.funding_source)) {
        programs.add(normalizeText(project.funding_source))
      }
      if (normalizeText(project.status)) statuses.add(normalizeText(project.status))
      risks.add(getComputedRiskLevel(project))
    })

    return {
      provinces: ['All', ...Array.from(provinces).sort()],
      municipalities: ['All', ...Array.from(municipalities).sort()],
      programs: ['All', ...Array.from(programs).sort()],
      statuses: ['All', ...Array.from(statuses).sort()],
      risks: ['All', ...Array.from(risks).sort()],
    }
  }, [projects])

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return projects.filter((project) => {
      const searchable = [
        project.project_name,
        project.description,
        project.project_type,
        project.funding_source,
        project.implementing_office,
        project.contractor,
        project.barangay,
        project.municipality,
        project.province,
        project.status,
        getComputedRiskLevel(project),
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .join(' ')

      const matchesSearch = !query || searchable.includes(query)
      const matchesProvince =
        provinceFilter === 'All' || normalizeText(project.province) === provinceFilter
      const matchesMunicipality =
        municipalityFilter === 'All' || normalizeText(project.municipality) === municipalityFilter
      const matchesProgram =
        programFilter === 'All' || normalizeText(project.funding_source) === programFilter
      const matchesStatus =
        statusFilter === 'All' || normalizeText(project.status) === statusFilter
      const matchesRisk =
        riskFilter === 'All' || getComputedRiskLevel(project) === riskFilter

      return (
        matchesSearch &&
        matchesProvince &&
        matchesMunicipality &&
        matchesProgram &&
        matchesStatus &&
        matchesRisk
      )
    })
  }, [
    projects,
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    statusFilter,
    riskFilter,
  ])

  const displayedProjects = useMemo(
    () =>
      filteredProjects.filter(
        (project) => project.displayLatitude !== null && project.displayLongitude !== null,
      ),
    [filteredProjects],
  )

  const coordinateIssueProjects = useMemo(
    () =>
      filteredProjects.filter(
        (project) => project.displayLatitude === null || project.displayLongitude === null,
      ),
    [filteredProjects],
  )

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    provinceFilter !== 'All' ||
    municipalityFilter !== 'All' ||
    programFilter !== 'All' ||
    statusFilter !== 'All' ||
    riskFilter !== 'All'

  function clearFilters() {
    setSearchTerm('')
    setProvinceFilter('All')
    setMunicipalityFilter('All')
    setProgramFilter('All')
    setStatusFilter('All')
    setRiskFilter('All')
  }

  const mapFabs = (
    <div className="gis-map-fab-stack">
      <button
        type="button"
        className="gis-fullscreen-fab-final"
        onClick={() => setIsMapFullscreen((current) => !current)}
        disabled={loading}
        aria-label={isMapFullscreen ? 'Exit full screen map' : 'Open full screen map'}
        title={isMapFullscreen ? 'Exit full screen' : 'Full screen map'}
      >
        {isMapFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
      </button>

      <button
        type="button"
        className="gis-refocus-fab-final"
        onClick={() => setFocusSignal((current) => current + 1)}
        disabled={loading}
        aria-label="Refocus map"
        title="Refocus map"
      >
        <RefocusIcon />
      </button>

      <button
        type="button"
        className="gis-refresh-fab-final"
        onClick={() => loadMapProjects(true)}
        disabled={loading || refreshing}
        aria-label="Refresh map"
        title="Refresh map"
      >
        <RefreshIcon />
      </button>
    </div>
  )

  return (
    <>
      <main className={`pm-map-page ${isHeroCompact ? 'is-map-scrolled' : ''}`}>
        <section className={`pm-map-hero ${isHeroCompact ? 'is-compact' : ''}`}>
          <div>
            <p className="pm-map-eyebrow">DILG-PDMU GIS Monitoring</p>
            <h1>Project GIS Map</h1>
            <p>Latest valid coordinates from project creation, editing, or updates.</p>
          </div>
        </section>

        {loadError && <div className="pm-map-alert pm-map-alert-error">{loadError}</div>}

        {updateGpsWarning && (
          <div className="pm-map-alert pm-map-alert-warning">{updateGpsWarning}</div>
        )}

        <section className="pm-map-summary-grid">
          <article className="pm-map-summary-card">
            <span>Total Projects</span>
            <strong>{filteredProjects.length}</strong>
            <p>Filtered records</p>
          </article>

          <article className="pm-map-summary-card">
            <span>Displayed</span>
            <strong>{displayedProjects.length}</strong>
            <p>Shown on map</p>
          </article>
        </section>

        <section className="pm-map-filter-card">
          <div className="pm-map-search-row">
            <label className="pm-map-search-field">
              <SearchIcon />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search project, LGU, program..."
              />
            </label>

            <button
              type="button"
              className={`pm-map-filter-button ${showFilters ? 'is-active' : ''}`}
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
              aria-pressed={showFilters}
            >
              <FilterIcon />
              <span>Filter</span>
            </button>
          </div>

          {showFilters && (
            <div className="pm-map-filter-grid">
              <label>
                <span>Province</span>
                <select
                  value={provinceFilter}
                  onChange={(event) => setProvinceFilter(event.target.value)}
                >
                  {filterOptions.provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>LGU / Municipality</span>
                <select
                  value={municipalityFilter}
                  onChange={(event) => setMunicipalityFilter(event.target.value)}
                >
                  {filterOptions.municipalities.map((municipality) => (
                    <option key={municipality} value={municipality}>
                      {municipality}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Program</span>
                <select
                  value={programFilter}
                  onChange={(event) => setProgramFilter(event.target.value)}
                >
                  {filterOptions.programs.map((program) => (
                    <option key={program} value={program}>
                      {program}
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
                  {filterOptions.statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Risk</span>
                <select
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value)}
                >
                  {filterOptions.risks.map((risk) => (
                    <option key={risk} value={risk}>
                      {risk}
                    </option>
                  ))}
                </select>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="pm-map-clear-button"
                  onClick={clearFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </section>

        <section className="pm-map-workspace">
          <div className="pm-map-card pm-map-main-card">
            <div className="pm-map-card-header">
              <div>
                <p>GIS View</p>
                <h2>Displayed Projects</h2>
              </div>

              <span>
                {displayedProjects.length} of {filteredProjects.length} mapped
              </span>
            </div>

            <div className="pm-map-legend">
              <span>
                <i className="pm-legend-dot pm-legend-neutral" />
                No Risk
              </span>
              <span>
                <i className="pm-legend-dot pm-legend-low" />
                Low Risk
              </span>
              <span>
                <i className="pm-legend-dot pm-legend-moderate" />
                Moderate Risk
              </span>
              <span>
                <i className="pm-legend-dot pm-legend-high" />
                High Risk
              </span>
            </div>

            <div className={`pm-map-shell ${isMapFullscreen ? 'is-map-fullscreen' : ''}`}>
              {loading ? (
                <div className="pm-map-loading">Loading GIS map records...</div>
              ) : (
                <MapContainer
                  center={MINDANAO_CENTER}
                  zoom={DEFAULT_ZOOM}
                  scrollWheelZoom
                  className="pm-leaflet-map"
                  zoomControl
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    detectRetina
                    maxZoom={19}
                  />

                  <MapResizeWatcher
                    trigger={`${displayedProjects.length}-${searchTerm}-${showFilters}-${isMapFullscreen}`}
                  />

                  <FitMapToMarkers
                    projects={displayedProjects}
                    focusSignal={focusSignal}
                  />

                  {displayedProjects.map((project) => {
                    const varianceInfo = getTargetPhysicalInfo(project)

                    return (
                      <Marker
                        key={`${project.id}-${project.displayLatitude}-${project.displayLongitude}-${project.coordinateSource}-${project.coordinateDate || ''}`}
                        position={[
                          project.displayLatitude as number,
                          project.displayLongitude as number,
                        ]}
                        icon={createProjectMarker(project)}
                      >
                        <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                          {project.project_name || 'Untitled Project'}
                        </Tooltip>

                        <Popup>
                          <div className="pm-map-popup">
                            <h3>{project.project_name || 'Untitled Project'}</h3>
                            <p>{getProjectLocation(project)}</p>

                            <div className="pm-map-popup-badges">
                              <span className={getStatusClass(project.status)}>
                                {project.status || 'No Status'}
                              </span>

                              <span className={getRiskClass(getComputedRiskLevel(project))}>
                                {getComputedRiskLevel(project)}
                              </span>
                            </div>

                            <dl>
                              <div>
                                <dt>Program</dt>
                                <dd>{project.funding_source || 'Not specified'}</dd>
                              </div>

                              <div>
                                <dt>Project Cost</dt>
                                <dd>{formatPhpFull(project.budget)}</dd>
                              </div>

                              <div>
                                <dt>Physical</dt>
                                <dd>{formatPercent(project.physical_accomplishment)}</dd>
                              </div>

                              <div>
                                <dt>Financial</dt>
                                <dd>{formatPercent(project.financial_accomplishment)}</dd>
                              </div>

                              <div>
                                <dt>Variance</dt>
                                <dd className={`pm-map-variance ${varianceInfo.className}`}>
                                  {varianceInfo.compactLabel}
                                </dd>
                              </div>

                              <div>
                                <dt>As of</dt>
                                <dd>{varianceInfo.asOfLabel.replace('As of ', '')}</dd>
                              </div>
                            </dl>

                            <Link to={`/projects/${project.id}`}>View Details</Link>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  })}
                </MapContainer>
              )}
            </div>
          </div>

          <aside className="pm-map-side-panel">
            <section className="pm-map-list-card">
              <div className="pm-map-card-header">
                <div>
                  <p>Mapped Records</p>
                  <h2>Displayed Projects</h2>
                </div>
              </div>

              <div className="pm-map-project-list">
                {displayedProjects.length === 0 && !loading ? (
                  <div className="pm-map-empty">No projects match the selected filters.</div>
                ) : (
                  displayedProjects.map((project) => {
                    const varianceInfo = getTargetPhysicalInfo(project)

                    return (
                    <article className="pm-map-project-card" key={project.id}>
                      <div>
                        <span>{project.province || 'No Province'}</span>
                        <h3>{project.project_name || 'Untitled Project'}</h3>
                        <p>{getProjectLocation(project)}</p>
                      </div>

                      <div className="pm-map-project-meta">
                        <span className={getStatusClass(project.status)}>
                          {project.status || 'No Status'}
                        </span>

                        <span className={getRiskClass(getComputedRiskLevel(project))}>
                          {getComputedRiskLevel(project)}
                        </span>
                      </div>

                      <dl>
                        <div>
                          <dt>Variance</dt>
                          <dd className={`pm-map-variance ${varianceInfo.className}`}>
                            {varianceInfo.compactLabel}
                          </dd>
                        </div>

                        <div>
                          <dt>As of</dt>
                          <dd>{varianceInfo.asOfLabel.replace('As of ', '')}</dd>
                        </div>

                        <div>
                          <dt>Project Cost</dt>
                          <dd>{formatPhpCompact(project.budget)}</dd>
                        </div>
                      </dl>

                      <div className="pm-map-project-actions">
                        <Link to={`/projects/${project.id}`}>View</Link>

                        {canUpdateProject && (
                          <Link to={`/projects/${project.id}/updates`}>Update GPS</Link>
                        )}
                      </div>
                    </article>
                    )
                  })
                )}
              </div>
            </section>

            <section className="pm-map-review-card">
              <div className="pm-map-card-header">
                <div>
                  <p>Coordinate Check</p>
                  <h2>Needs GPS Review</h2>
                </div>

                <strong>{coordinateIssueProjects.length}</strong>
              </div>

              <div className="pm-map-review-list">
                {coordinateIssueProjects.length === 0 ? (
                  <div className="pm-map-empty">
                    All filtered projects have usable coordinates.
                  </div>
                ) : (
                  coordinateIssueProjects.slice(0, 12).map((project) => (
                    <article className="pm-map-review-item" key={project.id}>
                      <div>
                        <span>{project.province || 'No Province'}</span>
                        <h3>{project.project_name || 'Untitled Project'}</h3>
                        <p>{project.coordinateIssue || 'GPS needs review.'}</p>
                      </div>

                      <Link to={`/projects/${project.id}`}>Open</Link>
                    </article>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </main>

      {portalReady ? createPortal(mapFabs, document.body) : null}
    </>
  )
}