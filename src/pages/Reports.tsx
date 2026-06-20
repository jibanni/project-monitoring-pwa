import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import {
  formatSignedVariance,
  getComputedRiskLevel,
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

  const date = new Date(value)

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

  if (normalized.includes('high')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) {
    return 'moderate'
  }
  if (normalized.includes('low')) return 'low'

  return 'default'
}

function cleanFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase()
}

function getProjectVariance(project: ProjectRow) {
  return getTargetPhysicalInfo(project)
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
  const [projects, setProjects] = useState<ProjectRow[]>([])
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

      setProjects((data || []) as ProjectRow[])
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load report data. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function clearFilters() {
    setSearchTerm('')
    setProvinceFilter('')
    setMunicipalityFilter('')
    setProgramFilter('')
    setStatusFilter('')
    setRiskFilter('')
  }

  const provinces = useMemo(() => {
    return Array.from(
      new Set(projects.map((project) => textValue(project.province)).filter(Boolean)),
    ).sort()
  }, [projects])

  const municipalities = useMemo(() => {
    return Array.from(
      new Set(
        projects
          .filter((project) =>
            provinceFilter ? textValue(project.province) === provinceFilter : true,
          )
          .map((project) => textValue(project.municipality))
          .filter(Boolean),
      ),
    ).sort()
  }, [projects, provinceFilter])

  const programs = useMemo(() => {
    return Array.from(
      new Set(
        projects
          .map((project) => textValue(project.funding_source || project.project_type))
          .filter(Boolean),
      ),
    ).sort()
  }, [projects])

  const statuses = useMemo(() => {
    return Array.from(
      new Set(projects.map((project) => textValue(project.status)).filter(Boolean)),
    ).sort()
  }, [projects])

  const risks = useMemo(() => {
    return Array.from(
      new Set(projects.map((project) => getComputedRiskLevel(project)).filter(Boolean)),
    ).sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const searchableText = [
        project.project_name,
        project.description,
        project.barangay,
        project.municipality,
        project.province,
        project.funding_source,
        project.project_type,
        project.status,
        getComputedRiskLevel(project),
        project.contractor,
        project.implementing_office,
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
        statusMatches &&
        riskMatches
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

  const activeFilterCount = [
    searchTerm,
    provinceFilter,
    municipalityFilter,
    programFilter,
    statusFilter,
    riskFilter,
  ].filter(Boolean).length

  const hasActiveSearch = activeFilterCount > 0
  const reportProjects = hasActiveSearch ? filteredProjects : projects

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

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Projects Included: ${reportProjects.length}`, 14, 41)

    autoTable(doc, {
      startY: 48,
      head: [
        [
          'Project',
          'Province',
          'Municipality',
          'Barangay',
          'Funding Source',
          'Cost',
          'Status',
          'Risk',
          'Actual',
          'Target',
          'Variance',
          'Financial',
          'Last Inspection',
        ],
      ],
      body: reportProjects.map((project) => {
        const varianceInfo = getProjectVariance(project)

        return [
          textValue(project.project_name) || 'Untitled Project',
          textValue(project.province) || '-',
          textValue(project.municipality) || '-',
          textValue(project.barangay) || '-',
          textValue(project.funding_source || project.project_type) || '-',
          formatCurrency(project.budget),
          textValue(project.status) || '-',
          getComputedRiskLevel(project),
          formatPercent(varianceInfo.actualPhysical),
          formatPercent(varianceInfo.targetPhysical),
          formatSignedVariance(varianceInfo.variance),
          formatPercent(project.financial_accomplishment),
          formatLongDate(project.last_inspection_date),
        ]
      }),
      styles: {
        fontSize: 6.6,
        cellPadding: 1.8,
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
        0: { cellWidth: 40 },
        4: { cellWidth: 28 },
        5: { cellWidth: 25 },
        8: { cellWidth: 17 },
        9: { cellWidth: 17 },
        10: { cellWidth: 19 },
        11: { cellWidth: 18 },
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
        'Funding Source': textValue(project.funding_source),
        'Project Type': textValue(project.project_type),
        'Implementing Office': textValue(project.implementing_office),
        Contractor: textValue(project.contractor),
        'Project Cost': toNumber(project.budget),
        Status: textValue(project.status),
        'Risk Level': getComputedRiskLevel(project),
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
        disabled={loading || projects.length === 0}
        aria-label="Export Excel"
        title="Export Excel"
      >
        <ExcelIcon />
      </button>

      <button
        type="button"
        className="reports-fab reports-fab-pdf"
        onClick={generatePdfReport}
        disabled={loading || projects.length === 0}
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
                placeholder="Search project, LGU, program..."
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
                  <option value="">All Provinces</option>
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
                  <option value="">All LGUs</option>
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
                  {filteredProjects.length} project/s matched from {projects.length} total record/s.
                </span>

                <span>
                  {activeFilterCount} active filter/s
                </span>
              </>
            ) : (
              <span>
                Search or use the filter button to display report records.
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
                        <th>Funding Source</th>
                        <th>Project Cost</th>
                        <th>Status</th>
                        <th>Risk</th>
                        <th>Actual</th>
                        <th>Target</th>
                        <th>Variance</th>
                        <th>Financial</th>
                        <th>Last Inspection</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredProjects.map((project) => {
                        const varianceInfo = getProjectVariance(project)

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
                            </td>
                            <td>{textValue(project.funding_source) || '-'}</td>
                            <td>{formatCurrency(project.budget)}</td>
                            <td>
                              <span className={`reports-status ${getStatusClass(project.status)}`}>
                                {textValue(project.status) || 'No Status'}
                              </span>
                            </td>
                            <td>
                              <span className={`reports-risk ${getRiskClass(getComputedRiskLevel(project))}`}>
                                {getComputedRiskLevel(project)}
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
                            <td>{formatLongDate(project.last_inspection_date)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="reports-mobile-list">
                  {filteredProjects.map((project) => {
                    const varianceInfo = getProjectVariance(project)

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
                          <span className={`reports-risk ${getRiskClass(getComputedRiskLevel(project))}`}>
                            {getComputedRiskLevel(project)}
                          </span>
                        </div>

                        <div className="reports-mobile-grid">
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
                          <span>
                            <strong>Last Inspection</strong>
                            {formatLongDate(project.last_inspection_date)}
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
