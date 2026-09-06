import { getDilgOfficeDirectoryEntry } from '../data/dilgOfficeDirectory'
import { normalizeProgramName } from './program'
import { getPmsRiskLevel } from './projectStatus'

export type ReportExportProject = {
  id: string
  project_name?: string | null
  description?: string | null
  status?: string | null
  project_type?: string | null
  funding_source?: string | null
  funding_year?: number | string | null
  implementing_office?: string | null
  contractor?: string | null
  budget?: number | string | null
  contract_amount?: number | string | null
  contract_duration?: number | string | null
  revised_contract_duration?: number | string | null
  start_date?: string | null
  target_completion_date?: string | null
  contract_expiration_date?: string | null
  revised_contract_expiration_date?: string | null
  barangay?: string | null
  municipality?: string | null
  province?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  physical_accomplishment?: number | string | null
  financial_accomplishment?: number | string | null
  disbursement_amount?: number | string | null
  risk_level?: string | null
  last_inspection_date?: string | null
  project_code?: string | null
  subaybayan_project_code?: string | null
  mode_of_implementation?: string | null
  beneficiaries?: string | number | null
  target_beneficiaries?: string | number | null
  [key: string]: unknown
}

export type ProjectBrieferUpdate = {
  engineer_id?: string | null
  inspection_date?: string | null
  status?: string | null
  physical_accomplishment?: number | string | null
  financial_accomplishment?: number | string | null
  disbursement_amount?: number | string | null
  issues?: string | null
  recommendations?: string | null
  remarks?: string | null
  created_at?: string | null
}

export type ProgramSummaryExportContext = {
  generatedBy: string
  generatedAt: Date
  engineersAssigned: string
  filtersLabel: string
}

export type ProjectBrieferExportContext = {
  generatedBy: string
  generatedAt: Date
  assignedEngineer: string
  latestUpdate?: ProjectBrieferUpdate | null
}

type HeaderAssets = {
  dilgDataUrl?: string
  bagongDataUrl?: string
}

const DILG_LOGO_URL = '/aide-memoire-dilg-logo.png'
const BAGONG_PILIPINAS_LOGO_URL = '/aide-memoire-bagong-pilipinas.png'
const WEBSITE = 'www.region10.dilg.gov.ph'
const regionalOffice = getDilgOfficeDirectoryEntry('REGIONAL OFFICE 10')

function textValue(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: unknown) {
  return `Php ${toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: unknown) {
  return `${toNumber(value).toFixed(2)}%`
}

function formatDate(value: unknown, fallback = '—') {
  const text = textValue(value)
  if (!text) return fallback
  const parsed = new Date(text.length <= 10 ? `${text}T00:00:00` : text)
  if (Number.isNaN(parsed.getTime())) return text
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(value: Date) {
  return value.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatFundingYear(value: unknown) {
  const text = textValue(value)
  if (!text) return '—'
  return /^FY\s/i.test(text) ? text : `FY ${text}`
}

function cleanFilename(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function projectProgram(project: ReportExportProject) {
  return normalizeProgramName(project.funding_source || project.project_type) || 'Unspecified Program'
}

function projectRisk(project: ReportExportProject) {
  return getPmsRiskLevel(project as Record<string, unknown>)
}

function normalizeStatus(value: unknown) {
  const status = textValue(value).toLowerCase()
  if (status.includes('complete')) return 'Completed'
  if (status.includes('ongoing')) return 'Ongoing'
  if (status.includes('suspend')) return 'Suspended'
  if (status.includes('terminat') || status.includes('cancel')) return 'Terminated'
  if (status.includes('not') || status.includes('start')) return 'Not Started'
  return textValue(value, 'Unspecified')
}

function riskBucket(value: string) {
  const risk = value.toLowerCase()
  if (risk.includes('high')) return 'high'
  if (risk.includes('moderate') || risk.includes('medium')) return 'moderate'
  if (risk.includes('low')) return 'low'
  return 'none'
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to load image.'))
    reader.readAsDataURL(blob)
  })
}

async function fetchImageDataUrl(url: string) {
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Unable to load ${url}`)
  return blobToDataUrl(await response.blob())
}

async function loadHeaderAssets(): Promise<HeaderAssets> {
  const [dilgResult, bagongResult] = await Promise.allSettled([
    fetchImageDataUrl(DILG_LOGO_URL),
    fetchImageDataUrl(BAGONG_PILIPINAS_LOGO_URL),
  ])

  return {
    dilgDataUrl: dilgResult.status === 'fulfilled' ? dilgResult.value : undefined,
    bagongDataUrl: bagongResult.status === 'fulfilled' ? bagongResult.value : undefined,
  }
}

function drawRegionalHeader(doc: any, assets: HeaderAssets) {
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 5

  if (assets.dilgDataUrl && assets.bagongDataUrl) {
    const dilgSize = 17
    const bagongSize = 17
    const gap = 4
    const groupWidth = dilgSize + gap + bagongSize
    const x = (pageWidth - groupWidth) / 2
    doc.addImage(assets.dilgDataUrl, 'PNG', x, y, dilgSize, dilgSize)
    doc.addImage(assets.bagongDataUrl, 'PNG', x + dilgSize + gap, y, bagongSize, bagongSize)
    y += 20
  } else {
    y += 2
  }

  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Republic of the Philippines', pageWidth / 2, y, { align: 'center' })
  y += 4.3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.8)
  doc.text('DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', pageWidth / 2, y, { align: 'center' })
  y += 4.3
  doc.text('REGION X - NORTHERN MINDANAO', pageWidth / 2, y, { align: 'center' })
  y += 4.3
  doc.text('REGIONAL OFFICE X', pageWidth / 2, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.7)
  doc.text(regionalOffice.address, pageWidth / 2, y, { align: 'center' })
  y += 3.8
  doc.setTextColor(0, 86, 180)
  doc.text(WEBSITE, pageWidth / 2, y, { align: 'center' })
  doc.setTextColor(20, 20, 20)
  y += 3.5
  doc.setDrawColor(170, 170, 170)
  doc.setLineWidth(0.2)
  doc.line(10, y, pageWidth - 10, y)
  return y + 4.5
}

function drawFooter(doc: any, context: { generatedBy: string; generatedAt: Date }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const totalPages = doc.getNumberOfPages()
  const footer = `Generated from PMS10 on ${formatDateTime(context.generatedAt)} by ${textValue(context.generatedBy, 'PMS10 User')}`

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.18)
    doc.line(10, pageHeight - 10, pageWidth - 10, pageHeight - 10)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.8)
    doc.setTextColor(115, 115, 115)
    const footerLines = doc.splitTextToSize(footer, pageWidth - 48).slice(0, 2)
    doc.text(footerLines, 10, pageHeight - 6.4)
    doc.setFont('helvetica', 'normal')
    doc.text(`${page} of ${totalPages}`, pageWidth - 10, pageHeight - 6.4, { align: 'right' })
  }
}

type ProgramAggregate = {
  fundingYear: string
  program: string
  projects: number
  projectCost: number
  completed: number
  ongoing: number
  notStarted: number
  suspended: number
  terminated: number
  averagePhysical: number
  averageFinancial: number
  noRisk: number
  lowRisk: number
  moderateRisk: number
  highRisk: number
}

function buildProgramAggregates(projects: ReportExportProject[]): ProgramAggregate[] {
  const grouped = new Map<string, { fundingYear: string; program: string; rows: ReportExportProject[] }>()

  projects.forEach((project) => {
    const fundingYear = textValue(project.funding_year, 'Unspecified')
    const program = projectProgram(project)
    const key = `${fundingYear}::${program}`
    const group = grouped.get(key) || { fundingYear, program, rows: [] }
    group.rows.push(project)
    grouped.set(key, group)
  })

  return Array.from(grouped.values())
    .map(({ fundingYear, program, rows }) => {
      const statuses = rows.map((project) => normalizeStatus(project.status))
      const risks = rows.map((project) => riskBucket(projectRisk(project)))
      const averagePhysical = rows.length > 0
        ? rows.reduce((sum, project) => sum + toNumber(project.physical_accomplishment), 0) / rows.length
        : 0
      const averageFinancial = rows.length > 0
        ? rows.reduce((sum, project) => sum + toNumber(project.financial_accomplishment), 0) / rows.length
        : 0

      return {
        fundingYear,
        program,
        projects: rows.length,
        projectCost: rows.reduce((sum, project) => sum + toNumber(project.budget), 0),
        completed: statuses.filter((status) => status === 'Completed').length,
        ongoing: statuses.filter((status) => status === 'Ongoing').length,
        notStarted: statuses.filter((status) => status === 'Not Started').length,
        suspended: statuses.filter((status) => status === 'Suspended').length,
        terminated: statuses.filter((status) => status === 'Terminated').length,
        averagePhysical,
        averageFinancial,
        noRisk: risks.filter((risk) => risk === 'none').length,
        lowRisk: risks.filter((risk) => risk === 'low').length,
        moderateRisk: risks.filter((risk) => risk === 'moderate').length,
        highRisk: risks.filter((risk) => risk === 'high').length,
      }
    })
    .sort((left, right) => {
      const yearCompare = right.fundingYear.localeCompare(left.fundingYear)
      return yearCompare !== 0 ? yearCompare : left.program.localeCompare(right.program)
    })
}

export async function generateProgramSummaryPdf(
  projects: ReportExportProject[],
  context: ProgramSummaryExportContext,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const assets = await loadHeaderAssets()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const aggregates = buildProgramAggregates(projects)
  const headerBottom = drawRegionalHeader(doc, assets)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(13, 62, 111)
  doc.text('PROGRAM SUMMARY REPORT', pageWidth / 2, headerBottom + 3, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.2)
  doc.setTextColor(45, 55, 70)
  doc.text(`Reporting Scope: ${context.filtersLabel}`, 12, headerBottom + 9)
  doc.text(`Engineers Assigned: ${context.engineersAssigned}`, 12, headerBottom + 13)
  doc.text(`Projects Included: ${projects.length}`, 12, headerBottom + 17)

  const totalCost = projects.reduce((sum, project) => sum + toNumber(project.budget), 0)
  const completed = projects.filter((project) => normalizeStatus(project.status) === 'Completed').length
  const highRisk = projects.filter((project) => riskBucket(projectRisk(project)) === 'high').length
  const avgPhysical = projects.length
    ? projects.reduce((sum, project) => sum + toNumber(project.physical_accomplishment), 0) / projects.length
    : 0
  const avgFinancial = projects.length
    ? projects.reduce((sum, project) => sum + toNumber(project.financial_accomplishment), 0) / projects.length
    : 0

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.6)
  doc.text(
    `Total Project Cost: ${formatMoney(totalCost)}   |   Completed: ${completed}   |   High Risk: ${highRisk}   |   Avg. Physical: ${formatPercent(avgPhysical)}   |   Avg. Financial: ${formatPercent(avgFinancial)}`,
    12,
    headerBottom + 22,
  )

  autoTable(doc, {
    startY: headerBottom + 27,
    margin: { left: 10, right: 10, bottom: 15 },
    head: [[
      'FY',
      'Program',
      'Projects',
      'Project Cost',
      'Completed',
      'Ongoing',
      'Not Started',
      'Suspended',
      'Terminated',
      'Avg. Physical',
      'Avg. Financial',
      'No Risk',
      'Low',
      'Moderate',
      'High',
    ]],
    body: aggregates.map((item) => [
      item.fundingYear === 'Unspecified' ? '—' : `FY ${item.fundingYear}`,
      item.program,
      item.projects,
      formatMoney(item.projectCost),
      item.completed,
      item.ongoing,
      item.notStarted,
      item.suspended,
      item.terminated,
      formatPercent(item.averagePhysical),
      formatPercent(item.averageFinancial),
      item.noRisk,
      item.lowRisk,
      item.moderateRisk,
      item.highRisk,
    ]),
    styles: { fontSize: 6.1, cellPadding: 1.0, overflow: 'linebreak', valign: 'middle' },
    headStyles: {
      fillColor: [13, 62, 111],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.0,
      cellPadding: 0.9,
    },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: {
      // Total width = 268 mm, matching the Project Details table below.
      // Status/risk columns are deliberately wider so labels such as
      // Completed, Suspended, and Terminated remain on one line.
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 34 },
      2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 18, halign: 'center' },
      9: { cellWidth: 19, halign: 'center' },
      10: { cellWidth: 19, halign: 'center' },
      11: { cellWidth: 14, halign: 'center' },
      12: { cellWidth: 11, halign: 'center' },
      13: { cellWidth: 16, halign: 'center' },
      14: { cellWidth: 11, halign: 'center' },
    },
  })

  const summaryTableEnd = Number((doc as any).lastAutoTable?.finalY || headerBottom + 60)
  let projectStartY = summaryTableEnd + 8
  if (projectStartY > 155) {
    doc.addPage()
    projectStartY = drawRegionalHeader(doc, assets)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(13, 62, 111)
  doc.text('PROJECT DETAILS', 10, projectStartY)

  autoTable(doc, {
    startY: projectStartY + 3,
    margin: { left: 10, right: 10, top: 50, bottom: 15 },
    head: [['Project', 'Program', 'Province/HUC', 'LGU', 'Cost', 'Status', 'Risk', 'Physical', 'Financial']],
    body: projects.map((project) => [
      textValue(project.project_name, 'Untitled Project'),
      projectProgram(project),
      textValue(project.province, '—'),
      textValue(project.municipality, '—'),
      formatMoney(project.budget),
      normalizeStatus(project.status),
      projectRisk(project),
      formatPercent(project.physical_accomplishment),
      formatPercent(project.financial_accomplishment),
    ]),
    styles: { fontSize: 6.1, cellPadding: 1.1, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [13, 62, 111], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 38 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 22 },
      6: { cellWidth: 18 },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 18, halign: 'center' },
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) drawRegionalHeader(doc, assets)
    },
  })

  drawFooter(doc, context)
  const fileDate = context.generatedAt.toISOString().slice(0, 10)
  doc.save(`PMS10_Program_Summary_Report_${fileDate}.pdf`)
}

export async function exportProgramSummaryExcel(
  projects: ReportExportProject[],
  context: ProgramSummaryExportContext,
) {
  const XLSX = await import('xlsx')
  const aggregates = buildProgramAggregates(projects)
  const footerText = `Generated from PMS10 on ${formatDateTime(context.generatedAt)} by ${textValue(context.generatedBy, 'PMS10 User')}`

  const summaryRows: Array<Array<string | number>> = [
    ['Republic of the Philippines'],
    ['DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT'],
    ['REGION X - NORTHERN MINDANAO'],
    ['REGIONAL OFFICE X'],
    [regionalOffice.address],
    [WEBSITE],
    [],
    ['PROGRAM SUMMARY REPORT'],
    ['Reporting Scope', context.filtersLabel],
    ['Engineers Assigned', context.engineersAssigned],
    ['Projects Included', projects.length],
    [],
    ['Funding Year', 'Program', 'Projects', 'Project Cost', 'Completed', 'Ongoing', 'Not Started', 'Suspended', 'Terminated', 'Avg. Physical', 'Avg. Financial', 'No Risk', 'Low Risk', 'Moderate Risk', 'High Risk'],
    ...aggregates.map((item) => [
      item.fundingYear === 'Unspecified' ? '' : item.fundingYear,
      item.program,
      item.projects,
      item.projectCost,
      item.completed,
      item.ongoing,
      item.notStarted,
      item.suspended,
      item.terminated,
      Number(item.averagePhysical.toFixed(2)),
      Number(item.averageFinancial.toFixed(2)),
      item.noRisk,
      item.lowRisk,
      item.moderateRisk,
      item.highRisk,
    ]),
    [],
    [footerText],
  ]

  const projectRows = projects.map((project) => ({
    Project: textValue(project.project_name, 'Untitled Project'),
    'Project Code': textValue(project.subaybayan_project_code || project.project_code),
    'Funding Year': textValue(project.funding_year),
    Program: projectProgram(project),
    'Province/HUC': textValue(project.province),
    LGU: textValue(project.municipality),
    Barangay: textValue(project.barangay),
    'Project Cost': toNumber(project.budget),
    Contractor: textValue(project.contractor),
    'Contract Amount': toNumber(project.contract_amount),
    Status: normalizeStatus(project.status),
    Risk: projectRisk(project),
    'Physical Accomplishment': toNumber(project.physical_accomplishment),
    'Financial Accomplishment': toNumber(project.financial_accomplishment),
    'Start Date': formatDate(project.start_date),
    'Target Completion': formatDate(project.target_completion_date),
  }))

  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  const projectsSheet = XLSX.utils.json_to_sheet(projectRows)
  XLSX.utils.sheet_add_aoa(projectsSheet, [[footerText]], { origin: -1 })

  summarySheet['!cols'] = [
    { wch: 14 }, { wch: 38 }, { wch: 14 }, { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
    { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 12 },
  ]
  projectsSheet['!cols'] = [
    { wch: 55 }, { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 24 },
    { wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
  ]

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Program Summary')
  XLSX.utils.book_append_sheet(workbook, projectsSheet, 'Projects')

  const fileDate = context.generatedAt.toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `PMS10_Program_Summary_Report_${fileDate}.xlsx`)
}

function addLabelValue(doc: any, label: string, value: string, x: number, y: number, labelWidth: number, valueWidth: number) {
  doc.setFillColor(244, 247, 251)
  doc.setDrawColor(205, 213, 224)
  doc.rect(x, y, labelWidth, 8, 'FD')
  doc.rect(x + labelWidth, y, valueWidth, 8, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(45, 55, 70)
  doc.text(label, x + 2, y + 5.2)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(value || '—', valueWidth - 4).slice(0, 1), x + labelWidth + 2, y + 5.2)
}

function getSectionBoxHeight(doc: any, text: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const usableWidth = pageWidth - 24
  const lines = doc.splitTextToSize(textValue(text, '—'), usableWidth - 8)
  return Math.max(18, 8 + lines.length * 4.2)
}

function addSectionBox(doc: any, title: string, text: string, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const usableWidth = pageWidth - 24
  const lines = doc.splitTextToSize(textValue(text, '—'), usableWidth - 8)
  const height = getSectionBoxHeight(doc, text)
  doc.setFillColor(13, 62, 111)
  doc.setDrawColor(13, 62, 111)
  doc.rect(12, startY, usableWidth, 7, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.4)
  doc.setTextColor(255, 255, 255)
  doc.text(title.toUpperCase(), 15, startY + 4.8)
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(205, 213, 224)
  doc.rect(12, startY + 7, usableWidth, height - 7, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.3)
  doc.setTextColor(35, 45, 60)
  doc.text(lines, 16, startY + 12)
  return startY + height + 4
}

export async function generateProjectBrieferPdf(
  project: ReportExportProject,
  context: ProjectBrieferExportContext,
) {
  const { default: jsPDF } = await import('jspdf')
  const assets = await loadHeaderAssets()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const latest = context.latestUpdate || null
  const headerBottom = drawRegionalHeader(doc, assets)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(13, 62, 111)
  doc.text('PROJECT BRIEFER', pageWidth / 2, headerBottom + 3, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  doc.setTextColor(75, 85, 100)
  const asOf = latest?.inspection_date || latest?.created_at || project.last_inspection_date || context.generatedAt.toISOString()
  doc.text(`As of ${formatDate(asOf)}`, pageWidth / 2, headerBottom + 8, { align: 'center' })

  const titleY = headerBottom + 13
  doc.setFillColor(239, 245, 252)
  doc.setDrawColor(190, 205, 222)
  doc.roundedRect(12, titleY, pageWidth - 24, 21, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(18, 52, 91)
  const titleLines = doc.splitTextToSize(textValue(project.project_name, 'Untitled Project'), pageWidth - 34).slice(0, 2)
  doc.text(titleLines, 17, titleY + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.7)
  doc.setTextColor(75, 85, 100)
  doc.text(`${projectProgram(project)} • ${formatFundingYear(project.funding_year)}`, 17, titleY + 17)

  const glanceY = titleY + 26
  const boxWidth = (pageWidth - 30) / 4
  const glance = [
    ['PROJECT COST', formatMoney(project.budget)],
    ['PHYSICAL', formatPercent(latest?.physical_accomplishment ?? project.physical_accomplishment)],
    ['FINANCIAL', formatPercent(latest?.financial_accomplishment ?? project.financial_accomplishment)],
    ['RISK', projectRisk(project)],
  ]

  glance.forEach(([label, value], index) => {
    const x = 12 + index * (boxWidth + 2)
    doc.setFillColor(250, 251, 253)
    doc.setDrawColor(205, 213, 224)
    doc.roundedRect(x, glanceY, boxWidth, 18, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.3)
    doc.setTextColor(100, 110, 125)
    doc.text(label, x + boxWidth / 2, glanceY + 5, { align: 'center' })
    doc.setFontSize(index === 0 ? 7.1 : 9.5)
    doc.setTextColor(index === 3 ? 13 : 20, index === 3 ? 62 : 55, index === 3 ? 111 : 85)
    const valueLines = doc.splitTextToSize(value, boxWidth - 4).slice(0, 2)
    doc.text(valueLines, x + boxWidth / 2, glanceY + 11, { align: 'center' })
  })

  let y = glanceY + 23
  const halfWidth = (pageWidth - 28) / 2
  const projectCode = textValue(project.subaybayan_project_code || project.project_code, '—')
  const location = [project.barangay, project.municipality, project.province].map((value) => textValue(value)).filter(Boolean).join(', ') || '—'
  const contractExpiration = project.revised_contract_expiration_date || project.contract_expiration_date || project.target_completion_date
  const beneficiaries = project.beneficiaries ?? project.target_beneficiaries

  const leftRows: Array<[string, string]> = [
    ['Project Code', projectCode],
    ['Location', location],
    ['Implementing LGU', textValue(project.implementing_office || project.municipality, '—')],
    ['Mode', textValue(project.mode_of_implementation, '—')],
    ['Status', normalizeStatus(latest?.status || project.status)],
    ['Assigned Engineer', textValue(context.assignedEngineer, 'No assigned engineer recorded')],
  ]
  const rightRows: Array<[string, string]> = [
    ['Contractor', textValue(project.contractor, '—')],
    ['Contract Amount', formatMoney(project.contract_amount || project.budget)],
    ['Contract Duration', textValue(project.revised_contract_duration || project.contract_duration, '—')],
    ['Start Date', formatDate(project.start_date)],
    ['Completion Date', formatDate(contractExpiration)],
    ['Disbursement', formatMoney(latest?.disbursement_amount ?? project.disbursement_amount)],
  ]

  leftRows.forEach(([label, value], index) => addLabelValue(doc, label, value, 12, y + index * 8, 31, halfWidth - 31))
  rightRows.forEach(([label, value], index) => addLabelValue(doc, label, value, 14 + halfWidth, y + index * 8, 31, halfWidth - 31))
  y += 52

  const addBrieferSection = (title: string, body: string) => {
    const sectionHeight = getSectionBoxHeight(doc, body)
    if (y + sectionHeight > 278) {
      doc.addPage()
      y = drawRegionalHeader(doc, assets)
    }
    y = addSectionBox(doc, title, body, y)
  }

  if (textValue(beneficiaries)) {
    addBrieferSection('Beneficiaries', textValue(beneficiaries))
  }

  addBrieferSection(
    'Project Description / Scope',
    textValue(project.description, 'No project description or scope has been recorded in PMS10.'),
  )

  const updateSummaryParts = [
    latest?.inspection_date ? `Latest monitoring date: ${formatDate(latest.inspection_date)}.` : '',
    latest?.status ? `Status: ${textValue(latest.status)}.` : '',
    latest?.remarks ? textValue(latest.remarks) : '',
  ].filter(Boolean)
  addBrieferSection(
    'Latest Monitoring Update',
    updateSummaryParts.join(' ') || 'No monitoring narrative has been recorded in the latest project update.',
  )
  addBrieferSection(
    'Issues / Concerns',
    textValue(latest?.issues, 'No major implementation issues were reported in the latest monitoring update.'),
  )
  addBrieferSection(
    'Recommendations / Next Steps',
    textValue(latest?.recommendations, 'Continue regular project monitoring and update PMS10 as implementation progresses.'),
  )

  drawFooter(doc, context)
  const stem = cleanFilename(textValue(project.project_name, 'project'))
  doc.save(`PMS10_Project_Briefer_${stem}.pdf`)
}
