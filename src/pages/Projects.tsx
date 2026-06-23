import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getComputedRiskLevel, getTargetPhysicalInfo } from '../utils/projectVariance'
import { canUpdateProject as canUpdateProjectByAor, filterProjectsByAor, getCanonicalRole } from '../utils/aorAccess'
import '../styles/projects.css'

type ProjectRow = {
  id: string
  project_name: string | null
  description: string | null
  status: string | null
  project_type: string | null
  funding_source: string | null
  funding_year?: number | string | null
  implementing_office: string | null
  contractor: string | null
  budget: number | string | null
  start_date: string | null
  target_completion_date: string | null
  barangay: string | null
  municipality: string | null
  province: string | null
  latitude: number | string | null
  longitude: number | string | null
  physical_accomplishment: number | string | null
  financial_accomplishment: number | string | null
  risk_level: string | null
  last_inspection_date: string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  updated_at: string | null
}

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

function formatCompactCurrency(value: unknown) {
  const amount = toNumber(value)
  const absAmount = Math.abs(amount)

  if (absAmount >= 1_000_000_000) {
    return `Php ${(amount / 1_000_000_000).toFixed(2)}B`
  }

  if (absAmount >= 1_000_000) {
    return `Php ${(amount / 1_000_000).toFixed(2)}M`
  }

  if (absAmount >= 1_000) {
    return `Php ${(amount / 1_000).toFixed(2)}K`
  }

  return formatCurrency(amount)
}

function formatPercent(value: unknown) {
  return `${toNumber(value).toFixed(0)}%`
}

function formatLongDate(value: string | null | undefined) {
  if (!value) return 'No date'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatFundingYear(value: unknown) {
  const rawValue = textValue(value)

  if (!rawValue) return ''

  const cleanValue = rawValue.replace(/^FY\s*/i, '').trim()
  const yearNumber = Number(cleanValue)

  if (Number.isFinite(yearNumber)) {
    return `FY ${Math.trunc(yearNumber)}`
  }

  return rawValue.toUpperCase().startsWith('FY') ? rawValue : `FY ${rawValue}`
}

function formatFundingDisplay(project: ProjectRow) {
  const year = formatFundingYear(project.funding_year)
  const source = textValue(project.funding_source || project.project_type)

  if (year && source) return `${year} · ${source}`
  return year || source || 'No Program'
}

function getStatusClass(status: string | null) {
  const normalized = textValue(status).toLowerCase()

  if (normalized.includes('complete')) return 'completed'
  if (normalized.includes('ongoing')) return 'ongoing'
  if (normalized.includes('not')) return 'not-started'
  if (normalized.includes('delayed')) return 'delayed'
  if (normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('terminate')) return 'terminated'

  return 'default'
}

function getRiskClass(risk: string | null) {
  const normalized = textValue(risk).toLowerCase()

  if (normalized.includes('high')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) {
    return 'moderate'
  }
  if (normalized.includes('low')) return 'low'

  return 'default'
}

function getProjectCardClass(risk: string | null) {
  const normalized = getRiskClass(risk)

  if (normalized === 'high') return 'project-card high-risk'
  if (normalized === 'moderate') return 'project-card moderate-risk'
  if (normalized === 'low') return 'project-card low-risk'

  return 'project-card'
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.8 4.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2Zm0 2a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Zm5.2 10.6 3.4 3.4a1 1 0 0 0 1.4-1.4l-3.4-3.4a1 1 0 0 0-1.4 1.4Z" />
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
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.7 7.2A7.8 7.8 0 0 0 4.6 11h2.1a5.8 5.8 0 0 1 9.6-2.35L14 11h6V5l-2.3 2.2ZM6.3 16.8A7.8 7.8 0 0 0 19.4 13h-2.1a5.8 5.8 0 0 1-9.6 2.35L10 13H4v6l2.3-2.2Z" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5Z" />
    </svg>
  )
}

export default function Projects() {
  const navigate = useNavigate()
  const auth = useAuth() as any
  const isAdmin = Boolean(auth?.isAdmin)
  const role = getCanonicalRole(auth?.profile?.role)
  const isROEngineer = Boolean(auth?.isROEngineer) || role === 'RO Engineer'

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('')
  const [municipalityFilter, setMunicipalityFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [fundingYearFilter, setFundingYearFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [isRegistryScrolled, setIsRegistryScrolled] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    let ticking = false

    function handleScroll() {
      if (ticking) return

      ticking = true
      requestAnimationFrame(() => {
        const nextScrolled = window.scrollY > 44
        setIsRegistryScrolled((current) =>
          current === nextScrolled ? current : nextScrolled,
        )
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

      setProjects((data || []) as ProjectRow[])
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load projects. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function clearFilters() {
    setSearchTerm('')
    setProvinceFilter('')
    setMunicipalityFilter('')
    setProgramFilter('')
    setFundingYearFilter('')
    setStatusFilter('')
    setRiskFilter('')
  }

  const allowedProjects = useMemo(() => {
    return filterProjectsByAor(projects, auth)
  }, [projects, auth])

  const provinces = useMemo(() => {
    return Array.from(
      new Set(allowedProjects.map((project) => textValue(project.province)).filter(Boolean)),
    ).sort()
  }, [allowedProjects])

  const municipalities = useMemo(() => {
    return Array.from(
      new Set(
        allowedProjects
          .filter((project) =>
            provinceFilter ? textValue(project.province) === provinceFilter : true,
          )
          .map((project) => textValue(project.municipality))
          .filter(Boolean),
      ),
    ).sort()
  }, [allowedProjects, provinceFilter])

  const programs = useMemo(() => {
    return Array.from(
      new Set(
        allowedProjects
          .map((project) => textValue(project.funding_source || project.project_type))
          .filter(Boolean),
      ),
    ).sort()
  }, [allowedProjects])

  const fundingYears = useMemo(() => {
    return Array.from(
      new Set(allowedProjects.map((project) => textValue(project.funding_year)).filter(Boolean)),
    ).sort((a, b) => Number(b) - Number(a))
  }, [allowedProjects])

  const statuses = useMemo(() => {
    return Array.from(
      new Set(allowedProjects.map((project) => textValue(project.status)).filter(Boolean)),
    ).sort()
  }, [allowedProjects])

  const risks = useMemo(() => {
    return Array.from(
      new Set(allowedProjects.map((project) => getComputedRiskLevel(project)).filter(Boolean)),
    ).sort()
  }, [allowedProjects])

  const filteredProjects = useMemo(() => {
    return allowedProjects.filter((project) => {
      const searchableText = [
        project.project_name,
        project.description,
        project.barangay,
        project.municipality,
        project.province,
        project.funding_year,
        project.funding_source,
        project.project_type,
        project.implementing_office,
        project.contractor,
        project.status,
        getComputedRiskLevel(project),
      ]
        .map(textValue)
        .join(' ')
        .toLowerCase()

      const searchMatches = searchTerm.trim()
        ? searchableText.includes(searchTerm.trim().toLowerCase())
        : true

      const provinceMatches = provinceFilter
        ? textValue(project.province) === provinceFilter
        : true

      const municipalityMatches = municipalityFilter
        ? textValue(project.municipality) === municipalityFilter
        : true

      const programMatches = programFilter
        ? textValue(project.funding_source || project.project_type) === programFilter
        : true

      const fundingYearMatches = fundingYearFilter
        ? textValue(project.funding_year) === fundingYearFilter
        : true

      const statusMatches = statusFilter
        ? textValue(project.status) === statusFilter
        : true

      const riskMatches = riskFilter
        ? getComputedRiskLevel(project) === riskFilter
        : true

      return (
        searchMatches &&
        provinceMatches &&
        municipalityMatches &&
        programMatches &&
        fundingYearMatches &&
        statusMatches &&
        riskMatches
      )
    })
  }, [
    allowedProjects,
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    fundingYearFilter,
    statusFilter,
    riskFilter,
  ])

  const totalCost = useMemo(() => {
    return filteredProjects.reduce((sum, project) => sum + toNumber(project.budget), 0)
  }, [filteredProjects])

  const notStartedCount = filteredProjects.filter((project) =>
    textValue(project.status).toLowerCase().includes('not'),
  ).length

  const ongoingCount = filteredProjects.filter((project) =>
    textValue(project.status).toLowerCase().includes('ongoing'),
  ).length

  const completedCount = filteredProjects.filter((project) =>
    textValue(project.status).toLowerCase().includes('complete'),
  ).length

  const highRiskCount = filteredProjects.filter((project) =>
    getComputedRiskLevel(project) === 'High',
  ).length

  const activeFilterCount = [
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    fundingYearFilter,
    statusFilter,
    riskFilter,
  ].filter(Boolean).length

  const canCreateProject = isAdmin || isROEngineer

  if (loading) {
    return (
      <div className="projects-page">
        <div className="projects-loading-card">
          <div className="projects-loader" />
          <h2>Loading Projects</h2>
          <p>Preparing project cards...</p>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="projects-page">
        <div className="projects-error-card">
          <h2>Projects Error</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={loadProjects}>
            Reload Projects
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`projects-page ${
        isRegistryScrolled ? 'is-registry-scrolled' : ''
      } ${filtersOpen ? 'filters-open' : ''}`}
    >
      <section className="projects-hero projects-registry-hero">
        <div className="projects-hero-copy">
          <p className="projects-eyebrow">Project Workspace</p>
          <h1>Project Registry</h1>
          <p>
            Mobile-first project monitoring cards for field inspection, validation,
            and progress tracking.
          </p>
        </div>
      </section>

      <div className="projects-hero-spacer" aria-hidden="true" />

      <div className="projects-floating-actions" aria-label="Project Registry actions">
        <button
          type="button"
          className="projects-floating-btn refresh"
          onClick={loadProjects}
          aria-label="Refresh projects"
          title="Refresh projects"
        >
          <RefreshIcon />
        </button>

        {canCreateProject && (
          <button
            type="button"
            className="projects-floating-btn add"
            onClick={() => navigate('/projects/create')}
            aria-label="Add project"
            title="Add project"
          >
            <AddIcon />
          </button>
        )}
      </div>

      <section className="projects-summary-grid" aria-label="Project summary">
        <div className="projects-summary-card">
          <span>Total Projects</span>
          <strong>{filteredProjects.length}</strong>
        </div>

        <div className="projects-summary-card gray">
          <span>Not Yet Started</span>
          <strong>{notStartedCount}</strong>
        </div>

        <div className="projects-summary-card orange">
          <span>Ongoing</span>
          <strong>{ongoingCount}</strong>
        </div>

        <div className="projects-summary-card green">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>

        <div className="projects-summary-card red">
          <span>High Risk</span>
          <strong>{highRiskCount}</strong>
        </div>

        <div className="projects-summary-card projects-cost-card" title={formatCurrency(totalCost)}>
          <span>Filtered Project Cost</span>
          <strong>{formatCompactCurrency(totalCost)}</strong>
        </div>
      </section>

      <section className="projects-filter-card" aria-label="Search and filters">
        <div className="projects-search-shell">
          <span className="projects-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search project, LGU, program, status..."
            aria-label="Search projects"
          />

          <button
            type="button"
            className={`projects-filter-toggle ${filtersOpen ? 'active' : ''}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-label="Open project filters"
            aria-expanded={filtersOpen}
          >
            <FilterIcon />
            {activeFilterCount > 0 && (
              <span className="projects-filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>

        <div className="projects-filter-panel" hidden={!filtersOpen}>
          <div className="projects-filter-panel-header">
            <div>
              <p className="projects-section-eyebrow">Advanced Filters</p>
              <h2>Refine records</h2>
            </div>

            {activeFilterCount > 0 && (
              <button type="button" className="projects-clear-btn" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>

          <div className="projects-filter-grid">
            <label>
              Province
              <select
                value={provinceFilter}
                onChange={(event) => {
                  setProvinceFilter(event.target.value)
                  setMunicipalityFilter('')
                }}
              >
                <option value="">All Provinces</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label>
              LGU / Municipality
              <select
                value={municipalityFilter}
                onChange={(event) => setMunicipalityFilter(event.target.value)}
              >
                <option value="">All LGUs</option>
                {municipalities.map((municipality) => (
                  <option key={municipality} value={municipality}>
                    {municipality}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Program
              <select
                value={programFilter}
                onChange={(event) => setProgramFilter(event.target.value)}
              >
                <option value="">All Programs</option>
                {programs.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Funding Year
              <select
                value={fundingYearFilter}
                onChange={(event) => setFundingYearFilter(event.target.value)}
              >
                <option value="">All Funding Years</option>
                {fundingYears.map((year) => (
                  <option key={year} value={year}>
                    {formatFundingYear(year)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Status
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
              Risk
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
          </div>
        </div>
      </section>

      <section className="projects-list-card">
        <div className="projects-list-header">
          <div>
            <p className="projects-section-eyebrow">Records</p>
            <h2>Project Cards</h2>
          </div>

          <span className="projects-count-pill">
            {filteredProjects.length} / {projects.length}
          </span>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="projects-empty">
            <h3>No projects found</h3>
            <p>Adjust the filters or clear all filters to show available projects.</p>
          </div>
        ) : (
          <div className="projects-card-grid">
            {filteredProjects.map((project) => {
              const physical = Math.min(
                100,
                Math.max(0, toNumber(project.physical_accomplishment)),
              )
              const financial = Math.min(
                100,
                Math.max(0, toNumber(project.financial_accomplishment)),
              )
              const varianceInfo = getTargetPhysicalInfo(project)

              return (
                <article key={project.id} className={getProjectCardClass(getComputedRiskLevel(project))}>
                  <div className="project-card-header">
                    <div className="project-card-main">
                      <p className="project-location">
                        {formatFundingDisplay(project)}
                      </p>
                      <h3>{textValue(project.project_name) || 'Untitled Project'}</h3>
                      <p className="project-address">
                        {textValue(project.barangay) || 'No Barangay'},{' '}
                        {textValue(project.municipality) || 'No Municipality'},{' '}
                        {textValue(project.province) || 'No Province'}
                      </p>
                    </div>

                    <div className="project-badges">
                      <span className={`project-status ${getStatusClass(project.status)}`}>
                        {textValue(project.status) || 'No Status'}
                      </span>
                      <span className={`project-risk ${getRiskClass(getComputedRiskLevel(project))}`}>
                        {getComputedRiskLevel(project)}
                      </span>
                    </div>
                  </div>

                  <div className="project-info-grid">
                    <div className="project-info-item">
                      <span>Project Cost</span>
                      <strong>{formatCurrency(project.budget)}</strong>
                    </div>

                    <div className="project-info-item">
                      <span>Target Date</span>
                      <strong>{formatLongDate(project.target_completion_date)}</strong>
                    </div>

                    <div className="project-info-item">
                      <span>Implementing Office</span>
                      <strong>{textValue(project.implementing_office) || '-'}</strong>
                    </div>

                    <div className="project-info-item project-variance-item">
                      <span>Variance</span>
                      <strong className={`project-variance-value ${varianceInfo.className}`}>
                        {varianceInfo.compactLabel}
                      </strong>
                      <small>{varianceInfo.asOfLabel}</small>
                    </div>
                  </div>

                  <div className="project-progress-group">
                    <div className="project-progress-row">
                      <div className="project-progress-label">
                        <span>Physical</span>
                        <strong>{formatPercent(physical)}</strong>
                      </div>
                      <div className="project-progress-track">
                        <div
                          className="project-progress-fill"
                          style={{ width: `${physical}%` }}
                        />
                      </div>
                    </div>

                    <div className="project-progress-row">
                      <div className="project-progress-label">
                        <span>Financial</span>
                        <strong>{formatPercent(financial)}</strong>
                      </div>
                      <div className="project-progress-track">
                        <div
                          className="project-progress-fill financial"
                          style={{ width: `${financial}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="project-last-inspection">
                    <span>Last Inspection</span>
                    <strong>{formatLongDate(project.last_inspection_date)}</strong>
                  </div>

                  <div className="project-actions">
                    <button
                      type="button"
                      className="project-view-btn"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      View
                    </button>

                    {canUpdateProjectByAor(project, auth) && (
                      <button
                        type="button"
                        className="project-update-btn"
                        onClick={() => navigate(`/projects/${project.id}/updates`)}
                      >
                        Update
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
