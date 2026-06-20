import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
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
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
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

type SummaryItem = {
  label: string
  value: string
  helper: string
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

function formatDate(value: string | null | undefined) {
  if (!value) return 'No date recorded'

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) return 'No date recorded'

  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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

function normalizeText(value: string | null | undefined) {
  return (value || '').trim()
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
  if (value.includes('not yet')) return 'pm-status-not-started'
  if (value.includes('suspended')) return 'pm-status-suspended'
  if (value.includes('cancelled') || value.includes('terminated')) return 'pm-status-cancelled'

  return 'pm-status-neutral'
}

function createProjectMarker(project: MapProject) {
  const risk = normalizeText(project.risk_level).toLowerCase()

  let markerClass = 'pm-marker-low'

  if (risk.includes('high')) markerClass = 'pm-marker-high'
  if (risk.includes('moderate')) markerClass = 'pm-marker-moderate'

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

function createClusterIcon(cluster: any) {
  const count = cluster.getChildCount()

  return L.divIcon({
    html: `
      <div class="pm-cluster">
        <span>${count}</span>
      </div>
    `,
    className: 'pm-cluster-wrapper',
    iconSize: L.point(48, 48, true),
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

function FitMapToMarkers({ projects }: { projects: MapProject[] }) {
  const map = useMap()

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize()

      const validProjects = projects.filter(
        (project) => project.displayLatitude !== null && project.displayLongitude !== null,
      )

      if (validProjects.length === 0) {
        map.setView(MINDANAO_CENTER, DEFAULT_ZOOM)
        return
      }

      if (validProjects.length === 1) {
        const project = validProjects[0]

        if (project) {
          map.setView(
            [project.displayLatitude as number, project.displayLongitude as number],
            13,
          )
        }

        return
      }

      const bounds = L.latLngBounds(
        validProjects.map((project) => [
          project.displayLatitude as number,
          project.displayLongitude as number,
        ]),
      )

      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 13,
      })
    }, 120)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [map, projects])

  return null
}

function MapResizeWatcher({ trigger }: { trigger: unknown }) {
  const map = useMap()

  useEffect(() => {
    const resizeMap = () => {
      map.invalidateSize()
    }

    resizeMap()

    const timeoutOne = window.setTimeout(resizeMap, 150)
    const timeoutTwo = window.setTimeout(resizeMap, 500)
    const timeoutThree = window.setTimeout(resizeMap, 1000)

    window.addEventListener('resize', resizeMap)
    window.addEventListener('orientationchange', resizeMap)

    return () => {
      window.clearTimeout(timeoutOne)
      window.clearTimeout(timeoutTwo)
      window.clearTimeout(timeoutThree)
      window.removeEventListener('resize', resizeMap)
      window.removeEventListener('orientationchange', resizeMap)
    }
  }, [map, trigger])

  return null
}

const refreshFabStyle: CSSProperties = {
  position: 'fixed',
  left: 'auto',
  right: 'max(18px, env(safe-area-inset-right))',
  bottom: 'calc(100px + env(safe-area-inset-bottom))',
  zIndex: 2147483600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  minWidth: 56,
  minHeight: 56,
  padding: 0,
  border: 0,
  borderRadius: 999,
  color: '#ffffff',
  background: 'linear-gradient(135deg, #f97316, #fb923c)',
  boxShadow:
    '0 18px 34px rgba(249, 115, 22, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
  lineHeight: 0,
  transform: 'none',
  cursor: 'pointer',
}

const refreshFabIconStyle: CSSProperties = {
  display: 'block',
  width: 25,
  height: 25,
  margin: 0,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
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
    function forceRefreshFabPosition() {
      const fab = document.getElementById('gis-refresh-fab-final')

      if (!fab) return

      fab.style.setProperty('position', 'fixed', 'important')
      fab.style.setProperty('left', 'auto', 'important')
      fab.style.setProperty('right', 'max(18px, env(safe-area-inset-right))', 'important')
      fab.style.setProperty('bottom', 'calc(100px + env(safe-area-inset-bottom))', 'important')
      fab.style.setProperty('z-index', '2147483600', 'important')
      fab.style.setProperty('transform', 'none', 'important')
    }

    forceRefreshFabPosition()

    window.addEventListener('resize', forceRefreshFabPosition)
    window.addEventListener('scroll', forceRefreshFabPosition, { passive: true })

    return () => {
      window.removeEventListener('resize', forceRefreshFabPosition)
      window.removeEventListener('scroll', forceRefreshFabPosition)
    }
  }, [])

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
      if (normalizeText(project.risk_level)) risks.add(normalizeText(project.risk_level))
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
        project.risk_level,
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
        riskFilter === 'All' || normalizeText(project.risk_level) === riskFilter

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

  const summaryItems = useMemo<SummaryItem[]>(() => {
    return [
      {
        label: 'Total Projects',
        value: String(filteredProjects.length),
        helper: 'Filtered records',
      },
      {
        label: 'Displayed',
        value: String(displayedProjects.length),
        helper: 'Shown on map',
      },
    ]
  }, [filteredProjects.length, displayedProjects.length])

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

  const refreshFab = (
    <button
      id="gis-refresh-fab-final"
      type="button"
      className="gis-refresh-fab-final"
      onClick={() => loadMapProjects(true)}
      disabled={loading || refreshing}
      aria-label="Refresh map"
      title="Refresh map"
      style={{
        ...refreshFabStyle,
        opacity: loading || refreshing ? 0.78 : 1,
        cursor: loading || refreshing ? 'wait' : 'pointer',
      }}
    >
      <span style={refreshFabIconStyle}>
        <RefreshIcon />
      </span>
    </button>
  )

  return (
    <>
      <main
        className={`pm-map-page ${isHeroCompact ? 'is-map-scrolled' : ''}`}
      >
        <section className={`pm-map-hero ${isHeroCompact ? 'is-compact' : ''}`}>
          <div>
            <p className="pm-map-eyebrow">DILG-PDMU GIS Monitoring</p>
            <h1>Project GIS Map</h1>
            <p>
              The map uses the latest valid coordinates entered from project creation,
              project editing, or project update records.
            </p>
          </div>
        </section>

        {loadError && <div className="pm-map-alert pm-map-alert-error">{loadError}</div>}

        {updateGpsWarning && (
          <div className="pm-map-alert pm-map-alert-warning">{updateGpsWarning}</div>
        )}

        <section className="pm-map-summary-grid">
          {summaryItems.map((item) => (
            <article className="pm-map-summary-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.helper}</p>
            </article>
          ))}
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
                {displayedProjects.length} of {filteredProjects.length} project/s mapped
              </span>
            </div>

            <div className="pm-map-legend">
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

            <div className="pm-map-shell">
              {loading ? (
                <div className="pm-map-loading">Loading GIS map records...</div>
              ) : (
                <MapContainer
                  center={MINDANAO_CENTER}
                  zoom={DEFAULT_ZOOM}
                  scrollWheelZoom
                  className="pm-leaflet-map"
                  style={{ width: '100%', height: '100%' }}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  <MapResizeWatcher trigger={`${displayedProjects.length}-${searchTerm}`} />
                  <FitMapToMarkers projects={displayedProjects} />

                  <MarkerClusterGroup
                    chunkedLoading
                    iconCreateFunction={createClusterIcon}
                    showCoverageOnHover={false}
                    spiderfyOnMaxZoom
                  >
                    {displayedProjects.map((project) => (
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

                              <span className={getRiskClass(project.risk_level)}>
                                {project.risk_level || 'No Risk'}
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
                                <dt>GPS Source</dt>
                                <dd>{project.coordinateLabel}</dd>
                              </div>

                              <div>
                                <dt>GPS Date</dt>
                                <dd>{formatDate(project.coordinateDate)}</dd>
                              </div>
                            </dl>

                            <Link to={`/projects/${project.id}`}>View Details</Link>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MarkerClusterGroup>
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
                  displayedProjects.slice(0, 20).map((project) => (
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

                        <span className={getRiskClass(project.risk_level)}>
                          {project.risk_level || 'No Risk'}
                        </span>
                      </div>

                      <dl>
                        <div>
                          <dt>GPS Source</dt>
                          <dd>{project.coordinateLabel}</dd>
                        </div>

                        <div>
                          <dt>GPS Date</dt>
                          <dd>{formatDate(project.coordinateDate)}</dd>
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
                  ))
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

                      {canUpdateProject && (
                        <Link to={`/projects/${project.id}/updates`}>Update GPS</Link>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </main>

      {portalReady && createPortal(refreshFab, document.body)}
    </>
  )
}