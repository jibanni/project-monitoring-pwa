import * as XLSX from 'xlsx'
import { toProjectTitleCase } from '../utils/projectTitleCase'
import { normalizeProgramName } from '../utils/program'

export const SUBAY_MIN_FUNDING_YEAR = 2023

export type SubayImportRecord = {
  rowNumber: number
  sheetName: string
  projectCode: string
  projectTitle: string
  region: string
  province: string
  municipality: string
  barangay: string
  description: string
  fundingYear: number | null
  fundingSource: string
  projectType: string
  status: string
  physicalAccomplishment: number
  financialAccomplishment: number
  riskLevel: string
  implementingOffice: string
  contractor: string
  budget: number
  contractAmount: number
  startDate: string | null
  targetCompletionDate: string | null
  contractExpirationDate: string | null
  revisedContractExpirationDate: string | null
  sourceSummary: string
}

export type SubayImportIssue = {
  rowNumber: number
  sheetName: string
  message: string
}

export type SubayParseResult = {
  records: SubayImportRecord[]
  issues: SubayImportIssue[]
  detectedSheets: string[]
}

type HeaderKey =
  | 'projectCode'
  | 'projectTitle'
  | 'region'
  | 'province'
  | 'municipality'
  | 'barangay'
  | 'description'
  | 'fundingYear'
  | 'fundingSource'
  | 'projectType'
  | 'status'
  | 'physicalStatus'
  | 'physicalAccomplishment'
  | 'financialAccomplishment'
  | 'riskLevel'
  | 'implementingOffice'
  | 'contractor'
  | 'budget'
  | 'contractAmount'
  | 'startDate'
  | 'targetCompletionDate'
  | 'contractExpirationDate'
  | 'revisedContractExpirationDate'

type HeaderDescriptor = {
  index: number
  candidates: string[]
}

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  projectCode: [
    'PROJECT CODE',
    'SUBAYBAYAN PROJECT CODE',
    'SUBAY PROJECT CODE',
    'PROJECT ID',
    'SUBAYBAYAN ID',
  ],
  projectTitle: ['PROJECT TITLE', 'TITLE', 'NAME OF PROJECT', 'PROJECT NAME'],
  region: ['REGION'],
  province: ['PROVINCE'],
  municipality: [
    'CITY MUNICIPALITY',
    'CITY / MUNICIPALITY',
    'CITY/MUNICIPALITY',
    'CITY',
    'MUNICIPALITY',
    'CITY OR MUNICIPALITY',
  ],
  barangay: ['BARANGAY', 'BRGY', 'BRGY.'],
  description: ['PROJECT DESCRIPTION', 'DESCRIPTION', 'COMPONENT DETAILS', 'COMPONENT DETAIL'],
  fundingYear: ['FUNDING YEAR', 'FY', 'YEAR'],
  fundingSource: ['PROGRAM', 'FUNDING SOURCE', 'FUNDING PROGRAM', 'SOURCE OF FUND'],
  projectType: ['TYPE OF PROJECT', 'PROJECT TYPE', 'SUB-TYPE OF PROJECT', 'SUB TYPE OF PROJECT'],
  status: ['STATUS', 'IMPLEMENTATION STATUS', 'PROJECT STATUS'],
  physicalStatus: ['PHYSICAL STATUS', 'STATUS OF IMPLEMENTATION'],
  physicalAccomplishment: [
    'PHYSICAL ACCOMPLISHMENT',
    'PHYSICAL ACCOMPLISHMENT %',
    'ACTUAL OWPA TO DATE',
    'LATEST OWPA TO DATE',
  ],
  financialAccomplishment: [
    'FINANCIAL ACCOMPLISHMENT',
    'FINANCIAL ACCOMPLISHMENT %',
    'FINANCIAL STATUS',
  ],
  riskLevel: ['RISK LEVEL', 'RISK'],
  implementingOffice: ['IMPLEMENTING OFFICE', 'IMPLEMENTING UNIT', 'PROJECT OWNER', 'UNIT IMPLEMENTING THE PROJECT'],
  contractor: ['NAME OF CONTRACTOR', 'CONTRACTOR'],
  budget: [
    'TOTAL PROJECT COST',
    'TOTAL PROGRAM PROJECT COST',
    'TOTAL PROGRAM / PROJECT COST',
    'ORIGINAL ALLOCATION',
    'NATIONAL SUBSIDY ORIGINAL ALLOCATION',
    'ALLOCATION',
    'PROJECT COST',
    'APPROVED BUDGET FOR THE CONTRACT',
    'ABC',
  ],
  contractAmount: [
    'CONTRACT PRICE',
    'CONTRACT AMOUNT',
    'AWARDED CONTRACT AMOUNT',
    'CONTRACT DETAILS CONTRACT PRICE',
    'CONTRACT DETAILS CONTRACT AMOUNT',
  ],
  startDate: [
    'ACTUAL START OF CONSTRUCTION',
    'ACTUAL START DATE',
    'START DATE',
    'DATE OF RECEIPT OF NTP',
    'DATE OF RECEIPT OF NOTICE TO PROCEED',
    'NOTICE TO PROCEED',
    'NTP',
  ],
  targetCompletionDate: [
    'INTENDED COMPLETION DATE',
    'TARGET COMPLETION DATE',
    'TARGET DATE OF COMPLETION',
    'END DATE',
  ],
  contractExpirationDate: [
    'DATE OF EXPIRATION OF CONTRACT',
    'CONTRACT EXPIRATION DATE',
    'EXPIRATION DATE',
  ],
  revisedContractExpirationDate: [
    'ACCOMPLISHMENT DATE',
    'TOTAL ACCOMPLISHMENT DATE',
    'ACCOMPLISHMENT TOTAL ACCOMPLISHMENT DATE',
    'TOTAL ACCOMPLISHMENT',
  ],
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeHeader(value: unknown) {
  return textValue(value)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeComparable(value: unknown) {
  return textValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeProjectCode(value: unknown) {
  return textValue(value).toUpperCase()
}

function parseNumber(value: unknown) {
  const rawValue = textValue(value)

  if (!rawValue) return 0

  const cleaned = rawValue.replace(/[₱,%]/g, '').replace(/,/g, '').trim()
  const parsed = Number(cleaned)

  return Number.isFinite(parsed) ? parsed : 0
}

function parsePercent(value: unknown) {
  const parsed = parseNumber(value)

  if (parsed < 0) return 0
  if (parsed > 100) return 100

  return parsed
}

function parseFundingYear(value: unknown) {
  const rawValue = textValue(value)
  const match = rawValue.match(/\b(20\d{2}|19\d{2})\b/)

  if (!match?.[1]) return null

  const year = Number(match[1])
  return Number.isFinite(year) ? year : null
}

function excelSerialDateToIso(value: number) {
  const parsed = XLSX.SSF.parse_date_code(value)

  if (!parsed) return null

  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString().slice(0, 10)
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return excelSerialDateToIso(value)
  }

  const rawValue = textValue(value)

  if (!rawValue) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
    return rawValue.slice(0, 10)
  }

  const numericValue = Number(rawValue)

  if (Number.isFinite(numericValue) && numericValue > 20000 && numericValue < 90000) {
    return excelSerialDateToIso(numericValue)
  }

  const parsed = new Date(rawValue)

  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString().slice(0, 10)
}

function normalizeStatus(statusValue: unknown, physicalStatusValue: unknown) {
  const rawStatus = textValue(physicalStatusValue) || textValue(statusValue)
  const normalized = rawStatus.toLowerCase()

  if (!normalized) return 'Not Yet Started'
  if (normalized.includes('complete')) return 'Completed'
  if (normalized.includes('ongoing') || normalized.includes('on-going')) return 'Ongoing'
  if (normalized.includes('not') || normalized.includes('no implementation')) return 'Not Yet Started'
  if (normalized.includes('suspend')) return 'Suspended'
  if (normalized.includes('terminat')) return 'Terminated'
  if (normalized.includes('procurement')) return 'Under Procurement'
  if (normalized.includes('review')) return 'Under Review'

  return rawStatus
}

function isSubayCompletedRecord(status: unknown, physicalAccomplishment: unknown) {
  const normalizedStatus = textValue(status).toLowerCase()
  const physical = parseNumber(physicalAccomplishment)

  return physical >= 100 || normalizedStatus.includes('complete')
}

function normalizeRiskLevel(value: unknown) {
  const normalized = textValue(value).toLowerCase()

  if (!normalized || normalized === 'none' || normalized.includes('no risk')) return 'None'
  if (normalized.includes('high')) return 'High'
  if (normalized.includes('medium') || normalized.includes('moderate')) return 'Moderate'
  if (normalized.includes('low')) return 'Low'

  return textValue(value) || 'None'
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value)
    if (text) return text
  }

  return ''
}

function firstDate(...values: unknown[]) {
  for (const value of values) {
    const parsed = normalizeDate(value)
    if (parsed) return parsed
  }

  return null
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  values.forEach((value) => {
    const normalized = normalizeHeader(value)

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(value)
    }
  })

  return result
}

function findHeaderIndex(rows: unknown[][]) {
  const maxRowsToScan = Math.min(rows.length, 80)

  for (let rowIndex = 0; rowIndex < maxRowsToScan; rowIndex += 1) {
    const normalizedCells = rows[rowIndex].map(normalizeHeader)
    const combined = normalizedCells.join(' | ')

    if (combined.includes('PROJECT CODE') && combined.includes('PROJECT TITLE')) {
      return rowIndex
    }
  }

  return -1
}

function createHeaderDescriptors(rows: unknown[][], headerIndex: number): HeaderDescriptor[] {
  const headerRow = rows[headerIndex] || []
  const nextRow = rows[headerIndex + 1] || []
  const previousRow = rows[headerIndex - 1] || []
  const maxColumns = Math.max(headerRow.length, nextRow.length, previousRow.length)
  const descriptors: HeaderDescriptor[] = []
  let carriedHeader = ''
  let leftHeader = ''

  for (let index = 0; index < maxColumns; index += 1) {
    const mainHeader = textValue(headerRow[index])
    const subHeader = textValue(nextRow[index])
    const previousHeader = textValue(previousRow[index])

    if (mainHeader) {
      carriedHeader = mainHeader
    }

    const candidates = uniqueStrings([
      mainHeader,
      subHeader,
      previousHeader,
      carriedHeader,
      `${mainHeader} ${subHeader}`,
      `${carriedHeader} ${subHeader}`,
      `${previousHeader} ${mainHeader}`,
      `${leftHeader} ${mainHeader}`,
      `${leftHeader} ${mainHeader} ${subHeader}`,
      `${previousHeader} ${mainHeader} ${subHeader}`,
      `${previousHeader} ${carriedHeader} ${subHeader}`,
    ])

    descriptors.push({
      index,
      candidates,
    })

    if (mainHeader) leftHeader = mainHeader
  }

  return descriptors
}

function candidateScore(key: HeaderKey, candidate: string, alias: string, index: number) {
  const normalizedCandidate = normalizeHeader(candidate)
  const normalizedAlias = normalizeHeader(alias)

  if (!normalizedCandidate || !normalizedAlias) return -Infinity

  let score = -Infinity

  if (normalizedCandidate === normalizedAlias) {
    score = 100
  } else if (normalizedCandidate.includes(normalizedAlias)) {
    score = 75
  }

  if (!Number.isFinite(score)) return -Infinity

  if (key === 'budget') {
    if (normalizedCandidate.includes('TOTAL PROJECT COST')) score += 35
    if (normalizedCandidate.includes('TOTAL PROGRAM PROJECT COST')) score += 35
    if (normalizedCandidate.includes('ORIGINAL ALLOCATION')) score += 15
    if (normalizedCandidate.includes('CONTRACT')) score -= 80
  }

  if (key === 'contractAmount') {
    if (normalizedCandidate.includes('CONTRACT')) score += 40
    if (normalizedCandidate.includes('PRICE')) score += 20
    if (normalizedCandidate.includes('ALLOCATION')) score -= 80
  }

  if (key === 'targetCompletionDate') {
    if (normalizedCandidate.includes('INTENDED COMPLETION DATE')) score += 50
    if (normalizedCandidate.includes('CONTRACT')) score += 20
    if (normalizedCandidate.includes('DATE OF COMPLETION')) score -= 80
    if (normalizedCandidate.includes('EXPIRATION')) score -= 80
    score += index / 1000
  }

  if (key === 'contractExpirationDate') {
    if (normalizedCandidate.includes('EXPIRATION')) score += 60
    if (normalizedCandidate.includes('CONTRACT')) score += 20
    if (normalizedCandidate.includes('ACCOMPLISHMENT')) score -= 90
    if (normalizedCandidate.includes('INTENDED')) score -= 80
    score += index / 1000
  }

  if (key === 'revisedContractExpirationDate') {
    if (normalizedCandidate.includes('ACCOMPLISHMENT')) score += 80
    if (normalizedCandidate.includes('TOTAL ACCOMPLISHMENT')) score += 80
    if (normalizedCandidate.includes('DATE')) score += 20
    if (normalizedCandidate.includes('EXPIRATION')) score -= 70
    if (normalizedCandidate.includes('INTENDED')) score -= 70
    score += index / 1000
  }

  if (key === 'startDate') {
    if (normalizedCandidate.includes('ACTUAL START')) score += 40
    if (normalizedCandidate.includes('NTP')) score += 20
    score += index / 1000
  }

  if (key === 'contractor') {
    if (normalizedCandidate.includes('CONTRACTOR')) score += 30
  }

  if (key === 'fundingSource') {
    if (normalizedCandidate === 'PROGRAM') score += 50
    if (normalizedCandidate.includes('PROJECT TYPE')) score -= 30
  }

  return score
}

function createHeaderMap(rows: unknown[][], headerIndex: number) {
  const descriptors = createHeaderDescriptors(rows, headerIndex)
  const map = new Map<HeaderKey, number>()

  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [HeaderKey, string[]][]) {
    let bestScore = -Infinity
    let bestIndex = -1

    descriptors.forEach((descriptor) => {
      descriptor.candidates.forEach((candidate) => {
        aliases.forEach((alias) => {
          const score = candidateScore(key, candidate, alias, descriptor.index)

          if (score > bestScore) {
            bestScore = score
            bestIndex = descriptor.index
          }
        })
      })
    })

    if (bestIndex >= 0) {
      map.set(key, bestIndex)
    }
  }

  return map
}

function getCell(row: unknown[], headerMap: Map<HeaderKey, number>, key: HeaderKey) {
  const index = headerMap.get(key)

  if (index === undefined || index < 0) return ''

  return row[index]
}

function getProjectFingerprint(
  record: Pick<SubayImportRecord, 'fundingYear' | 'fundingSource' | 'province' | 'municipality' | 'projectTitle'>,
) {
  return [
    record.fundingYear || '',
    record.fundingSource,
    record.province,
    record.municipality,
    record.projectTitle,
  ]
    .map(normalizeComparable)
    .join('|')
}

export function createProjectFingerprint(input: {
  funding_year?: unknown
  funding_source?: unknown
  province?: unknown
  municipality?: unknown
  project_name?: unknown
}) {
  return [
    input.funding_year || '',
    input.funding_source,
    input.province,
    input.municipality,
    input.project_name,
  ]
    .map(normalizeComparable)
    .join('|')
}

export function getSubayProjectFingerprint(record: SubayImportRecord) {
  return getProjectFingerprint(record)
}

function hasImportContractEvidence(record: SubayImportRecord) {
  return (
    textValue(record.contractor).length > 0 ||
    parseNumber(record.contractAmount) > 0 ||
    textValue(record.startDate).length > 0 ||
    textValue(record.contractExpirationDate).length > 0 ||
    textValue((record as any).revisedContractExpirationDate).length > 0
  )
}

export function getSimplifiedImportStatus(record: SubayImportRecord) {
  const rawStatus = textValue(record.status).toLowerCase()
  const physical = parseNumber(record.physicalAccomplishment)

  if (physical >= 100 || rawStatus.includes('complete')) return 'Completed'
  if (rawStatus.includes('terminat')) return 'Terminated'
  if (rawStatus.includes('cancel')) return 'Cancelled'
  if (rawStatus.includes('suspend')) return 'Suspended'
  if (physical > 0) return 'Ongoing'
  if (hasImportContractEvidence(record)) return 'Not Yet Started'

  return 'Under Procurement'
}

export function projectPayloadFromSubayRecord(record: SubayImportRecord) {
  const projectCost = record.budget || record.contractAmount || 0
  const payload: Record<string, unknown> = {
    subaybayan_project_code: record.projectCode,
    project_name: toProjectTitleCase(record.projectTitle),
    description: record.description || null,
    status: getSimplifiedImportStatus(record),
    project_type: record.projectType || null,
    funding_source: normalizeProgramName(record.fundingSource) || null,
    funding_year: record.fundingYear,
    implementing_office: record.implementingOffice || null,
    contractor: record.contractor || null,
    budget: projectCost,
    barangay: record.barangay || null,
    municipality: record.municipality || null,
    province: record.province || null,
    physical_accomplishment: record.physicalAccomplishment,
    financial_accomplishment: record.financialAccomplishment,
    risk_level: isSubayCompletedRecord(record.status, record.physicalAccomplishment)
      ? 'None'
      : record.riskLevel || 'None',
    updated_at: new Date().toISOString(),
  }

  if (record.startDate) payload.start_date = record.startDate
  if (record.targetCompletionDate) payload.target_completion_date = record.targetCompletionDate
  if (record.contractExpirationDate) payload.contract_expiration_date = record.contractExpirationDate
  if (record.revisedContractExpirationDate) payload.revised_contract_expiration_date = record.revisedContractExpirationDate

  return payload
}

export async function parseSubayMasterlistFile(file: File): Promise<SubayParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  })

  const records: SubayImportRecord[] = []
  const issues: SubayImportIssue[] = []
  const detectedSheets: string[] = []
  const seenCodes = new Set<string>()

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    })

    if (!rows.length) return

    const headerIndex = findHeaderIndex(rows)

    if (headerIndex < 0) return

    detectedSheets.push(sheetName)

    const headerMap = createHeaderMap(rows, headerIndex)

    if (!headerMap.has('projectCode') || !headerMap.has('projectTitle')) {
      issues.push({
        sheetName,
        rowNumber: headerIndex + 1,
        message: 'Required columns PROJECT CODE and PROJECT TITLE were not detected.',
      })
      return
    }

    rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
      const rowNumber = headerIndex + rowOffset + 2
      const projectCode = normalizeProjectCode(getCell(row, headerMap, 'projectCode'))
      const rawTitle = textValue(getCell(row, headerMap, 'projectTitle'))
      const projectTitle = toProjectTitleCase(rawTitle)

      if (!projectCode && !rawTitle) return

      if (!projectCode || !projectTitle) {
        issues.push({
          sheetName,
          rowNumber,
          message: 'Skipped row because PROJECT CODE or PROJECT TITLE is missing.',
        })
        return
      }

      const fundingYear = parseFundingYear(getCell(row, headerMap, 'fundingYear'))

      if (!fundingYear) {
        issues.push({
          sheetName,
          rowNumber,
          message: 'Skipped row because FUNDING YEAR is missing.',
        })
        return
      }

      if (fundingYear < SUBAY_MIN_FUNDING_YEAR) {
        issues.push({
          sheetName,
          rowNumber,
          message: `Skipped row because funding year ${fundingYear} is below FY ${SUBAY_MIN_FUNDING_YEAR}.`,
        })
        return
      }

      if (seenCodes.has(projectCode)) {
        issues.push({
          sheetName,
          rowNumber,
          message: `Duplicate PROJECT CODE in uploaded file: ${projectCode}. Only the first occurrence will be imported.`,
        })
        return
      }

      seenCodes.add(projectCode)

      const status = normalizeStatus(
        getCell(row, headerMap, 'status'),
        getCell(row, headerMap, 'physicalStatus'),
      )

      const physicalAccomplishment =
        status === 'Completed'
          ? 100
          : parsePercent(getCell(row, headerMap, 'physicalAccomplishment'))

      const fundingSource = normalizeProgramName(
        firstNonEmpty(
          getCell(row, headerMap, 'fundingSource'),
          getCell(row, headerMap, 'projectType'),
          'SubayBAYAN',
        ),
      )

      const budget = parseNumber(getCell(row, headerMap, 'budget'))
      const contractAmount = parseNumber(getCell(row, headerMap, 'contractAmount'))
      const targetCompletionDate = firstDate(getCell(row, headerMap, 'targetCompletionDate'))
      const contractExpirationDate = firstDate(getCell(row, headerMap, 'contractExpirationDate'))
      const revisedContractExpirationDate = firstDate(getCell(row, headerMap, 'revisedContractExpirationDate'))

      records.push({
        rowNumber,
        sheetName,
        projectCode,
        projectTitle,
        region: textValue(getCell(row, headerMap, 'region')),
        province: textValue(getCell(row, headerMap, 'province')),
        municipality: textValue(getCell(row, headerMap, 'municipality')),
        barangay: textValue(getCell(row, headerMap, 'barangay')),
        description: textValue(getCell(row, headerMap, 'description')),
        fundingYear,
        fundingSource,
        projectType: textValue(getCell(row, headerMap, 'projectType')),
        status,
        physicalAccomplishment,
        financialAccomplishment: parsePercent(getCell(row, headerMap, 'financialAccomplishment')),
        riskLevel: normalizeRiskLevel(getCell(row, headerMap, 'riskLevel')),
        implementingOffice: textValue(getCell(row, headerMap, 'implementingOffice')),
        contractor: textValue(getCell(row, headerMap, 'contractor')),
        budget,
        contractAmount,
        startDate: firstDate(getCell(row, headerMap, 'startDate')),
        targetCompletionDate,
        contractExpirationDate,
        revisedContractExpirationDate,
        sourceSummary: `${sheetName} row ${rowNumber}`,
      })
    })
  })

  if (!detectedSheets.length) {
    issues.push({
      sheetName: file.name,
      rowNumber: 0,
      message: 'No SubayBAYAN sheet with PROJECT CODE and PROJECT TITLE headers was detected.',
    })
  }

  return {
    records,
    issues,
    detectedSheets,
  }
}
