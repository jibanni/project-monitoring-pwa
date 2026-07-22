import * as XLSX from 'xlsx'
import { toProjectTitleCase } from '../utils/projectTitleCase'
import { normalizeProgramName } from '../utils/program'

/*
  PMS10 SubayBAYAN guided parser.

  This parser intentionally supports the two known SubayBAYAN masterlist formats:
  - FY 2024 and below extract
  - FY 2025 and above extract

  It avoids relying on column guessing for critical fields. Format detection is
  based on header signatures, then each format is parsed through a fixed profile.
*/

export const SUBAY_MIN_FUNDING_YEAR = 2017

export type SubayFormatId = 'fy2024_below' | 'fy2025_above' | 'unknown'

export type SubayDetectedFormat = {
  id: SubayFormatId
  label: string
  confidence: number
  headerRowNumber: number
  dataStartRowNumber: number
}

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
  subayFormat: SubayFormatId
  subayFormatLabel: string
  validationWarnings: string[]
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
  detectedFormat: SubayDetectedFormat | null
}

type HeaderKey =
  | 'projectOwner'
  | 'projectCode'
  | 'projectTitle'
  | 'region'
  | 'province'
  | 'municipality'
  | 'barangay'
  | 'exactLocation'
  | 'description'
  | 'fundingYear'
  | 'fundingSource'
  | 'projectType'
  | 'subProjectType'
  | 'procurementType'
  | 'beneficiaries'
  | 'status'
  | 'physicalStatus'
  | 'physicalAccomplishment'
  | 'targetPhysicalAccomplishment'
  | 'actualPhysicalAccomplishment'
  | 'slippage'
  | 'financialAccomplishment'
  | 'riskLevel'
  | 'remarks'
  | 'implementingOffice'
  | 'contractor'
  | 'budget'
  | 'contractAmount'
  | 'startDate'
  | 'ntpDate'
  | 'targetCompletionDate'
  | 'contractExpirationDate'
  | 'revisedContractExpirationDate'

type SubayFormatProfile = {
  id: SubayFormatId
  label: string
  expectedHeaderRowNumber: number
  dataStartOffset: number
  requiredSignature: string[]
  strongSignature: string[]
  columns: Partial<Record<HeaderKey, number>>
}

const FY_2024_BELOW_PROFILE: SubayFormatProfile = {
  id: 'fy2024_below',
  label: 'SubayBAYAN FY 2024 and Below Format',
  expectedHeaderRowNumber: 2,
  dataStartOffset: 1,
  requiredSignature: ['PROGRAM', 'PROJECT CODE', 'PROJECT TITLE', 'REGION', 'PROVINCE', 'CITY MUNICIPALITY', 'FUNDING YEAR'],
  strongSignature: ['EXACT LOCATION', 'PROJECT DESCRIPTION', 'TOTAL PROJECT COST', 'CONTRACT DETAILS'],
  columns: {
    fundingSource: 0, // A PROGRAM
    projectCode: 1, // B PROJECT CODE
    projectTitle: 2, // C PROJECT TITLE
    region: 3, // D REGION
    province: 4, // E PROVINCE
    municipality: 5, // F CITY/MUNICIPALITY
    barangay: 6, // G BARANGAY
    exactLocation: 7, // H EXACT LOCATION
    description: 9, // J PROJECT DESCRIPTION
    fundingYear: 11, // L FUNDING YEAR
    projectType: 12, // M TYPE OF PROJECT
    subProjectType: 13, // N SUB-TYPE OF PROJECT
    procurementType: 14, // O PROCUREMENT TYPE
    beneficiaries: 16, // Q BENEFICIARIES
    status: 17, // R STATUS
    remarks: 18, // S REMARKS
    budget: 28, // AC TOTAL PROJECT COST
    implementingOffice: 29, // AD IMPLEMENTING UNIT
    contractor: 36, // AK NAME OF CONTRACTOR
    contractAmount: 37, // AL CONTRACT PRICE
    targetCompletionDate: 41, // AP INTENDED COMPLETION DATE under Contract Details
    ntpDate: 42, // AQ DATE OF RECEIPT OF NTP
    contractExpirationDate: 43, // AR DATE OF EXPIRATION OF CONTRACT
    physicalAccomplishment: 60, // BI TOTAL ACCOMPLISHMENT
    revisedContractExpirationDate: 61, // BJ DATE, used as accomplishment date only when completed
  },
}

const FY_2025_ABOVE_PROFILE: SubayFormatProfile = {
  id: 'fy2025_above',
  label: 'SubayBAYAN FY 2025 and Above Format',
  expectedHeaderRowNumber: 9,
  dataStartOffset: 2,
  requiredSignature: ['PROJECT OWNER', 'REGION', 'PROVINCE', 'CITY MUNICIPALITY', 'PROJECT CODE', 'PROJECT TITLE', 'PROGRAM', 'FUNDING YEAR'],
  strongSignature: ['COMPONENT DETAILS', 'TOTAL PROGRAM PROJECT COST', 'TARGET OWPA TO DATE', 'LATEST OWPA TO DATE', 'RISK LEVEL'],
  columns: {
    projectOwner: 0, // A PROJECT OWNER
    region: 1, // B REGION
    province: 2, // C PROVINCE
    municipality: 3, // D CITY/MUNICIPALITY
    barangay: 4, // E BARANGAY
    projectCode: 5, // F PROJECT CODE
    projectTitle: 6, // G PROJECT TITLE
    description: 7, // H COMPONENT DETAILS
    fundingSource: 8, // I PROGRAM
    projectType: 9, // J PROJECT TYPE
    fundingYear: 10, // K FUNDING YEAR
    status: 18, // S APPROVAL STATUS
    physicalStatus: 19, // T PHYSICAL STATUS
    budget: 42, // AQ TOTAL PROGRAM / PROJECT COST
    targetPhysicalAccomplishment: 86, // CI TARGET OWPA TO DATE (%)
    actualPhysicalAccomplishment: 87, // CJ ACTUAL OWPA TO DATE (%)
    physicalAccomplishment: 88, // CK LATEST OWPA TO DATE (%)
    slippage: 89, // CL SLIPPAGE
    riskLevel: 90, // CM RISK LEVEL
    remarks: 93, // CP REMARKS
    implementingOffice: 117, // DN IMPLEMENTING UNIT
    targetCompletionDate: 120, // DQ INTENDED COMPLETION DATE
    startDate: 121, // DR ACTUAL START DATE
    contractor: 122, // DS CONTRACTOR
    contractAmount: 126, // DW CONTRACT AMOUNT
    ntpDate: 129, // DZ NTP
    contractExpirationDate: 130, // EA EXPIRATION DATE
  },
}

const FORMAT_PROFILES = [FY_2024_BELOW_PROFILE, FY_2025_ABOVE_PROFILE]

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

function getCell(row: unknown[], columnIndex: number | undefined) {
  if (columnIndex === undefined || columnIndex < 0) return ''
  return row[columnIndex]
}

function getProfileCell(row: unknown[], profile: SubayFormatProfile, key: HeaderKey) {
  return getCell(row, profile.columns[key])
}

function parseNumber(value: unknown) {
  const rawValue = textValue(value)

  if (!rawValue) return 0

  // Some 2025+ columns contain component lines like:
  // 1). 20.00
  // 2). 10.00
  // For project-level fields, use the last numeric value, which normally
  // represents the latest/project-level value in SubayBAYAN exports.
  const numericMatches = rawValue
    .replace(/[₱,%]/g, '')
    .match(/-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g)

  if (!numericMatches?.length) return 0

  const lastValue = numericMatches[numericMatches.length - 1].replace(/,/g, '')
  const parsed = Number(lastValue)

  return Number.isFinite(parsed) ? parsed : 0
}

function parseCurrencyTotal(...values: unknown[]) {
  return values.reduce<number>((total, value) => total + parseNumber(value), 0)
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

function rowText(row: unknown[]) {
  return row.map(normalizeHeader).join(' | ')
}

function containsAll(row: unknown[], signatures: string[]) {
  const combined = rowText(row)

  return signatures.every((signature) => combined.includes(normalizeHeader(signature)))
}

function scoreProfileForRow(row: unknown[], profile: SubayFormatProfile) {
  const combined = rowText(row)
  let score = 0

  profile.requiredSignature.forEach((signature) => {
    if (combined.includes(normalizeHeader(signature))) score += 12
  })

  profile.strongSignature.forEach((signature) => {
    if (combined.includes(normalizeHeader(signature))) score += 8
  })

  if (containsAll(row, profile.requiredSignature)) score += 25

  return score
}

function detectSheetFormat(rows: unknown[][]): SubayDetectedFormat | null {
  const maxRowsToScan = Math.min(rows.length, 80)
  let bestMatch:
    | {
        profile: SubayFormatProfile
        headerIndex: number
        score: number
      }
    | null = null

  for (let rowIndex = 0; rowIndex < maxRowsToScan; rowIndex += 1) {
    const row = rows[rowIndex] || []

    for (const profile of FORMAT_PROFILES) {
      const score = scoreProfileForRow(row, profile)

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          profile,
          headerIndex: rowIndex,
          score,
        }
      }
    }
  }

  if (!bestMatch || bestMatch.score < 70) {
    return null
  }

  const confidence = Math.min(100, Math.round(bestMatch.score))
  const dataStartIndex = bestMatch.headerIndex + bestMatch.profile.dataStartOffset

  return {
    id: bestMatch.profile.id,
    label: bestMatch.profile.label,
    confidence,
    headerRowNumber: bestMatch.headerIndex + 1,
    dataStartRowNumber: dataStartIndex + 1,
  }
}

function profileById(id: SubayFormatId) {
  return FORMAT_PROFILES.find((profile) => profile.id === id) || null
}

function normalizeStatus(statusValue: unknown, physicalStatusValue: unknown, physicalAccomplishmentValue: unknown) {
  const physical = parsePercent(physicalAccomplishmentValue)
  const rawStatus = textValue(physicalStatusValue) || textValue(statusValue)
  const normalized = rawStatus.toLowerCase()

  if (physical >= 100 || normalized.includes('complete')) return 'Completed'
  if (normalized.includes('terminat')) return 'Terminated'
  if (normalized.includes('cancel')) return 'Cancelled'
  if (normalized.includes('suspend')) return 'Suspended'
  if (normalized.includes('ongoing') || normalized.includes('on-going')) return 'Ongoing'
  if (normalized.includes('not') || normalized.includes('no implementation')) return 'Not Yet Started'
  if (normalized.includes('procurement')) return 'Under Procurement'
  if (normalized.includes('review')) return 'Under Review'
  if (normalized.includes('vetted')) return physical > 0 ? 'Ongoing' : 'Under Procurement'

  return rawStatus || (physical > 0 ? 'Ongoing' : 'Not Yet Started')
}

function isSubayCompletedRecord(status: unknown, physicalAccomplishment: unknown) {
  const normalizedStatus = textValue(status).toLowerCase()
  const physical = parseNumber(physicalAccomplishment)

  return physical >= 100 || normalizedStatus.includes('complete')
}

function normalizeRiskLevel(value: unknown, physicalAccomplishment: unknown, status: unknown) {
  if (isSubayCompletedRecord(status, physicalAccomplishment)) return 'None'

  const normalized = textValue(value).toLowerCase()

  if (!normalized || normalized === 'none' || normalized.includes('no risk')) return 'None'
  if (normalized.includes('high')) return 'High'
  if (normalized.includes('medium') || normalized.includes('moderate')) return 'Moderate'
  if (normalized.includes('low')) return 'Low'
  if (normalized.includes('ahead') || normalized.includes('schedule')) return 'None'

  return textValue(value) || 'None'
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
    textValue(record.revisedContractExpirationDate).length > 0
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

export function getSubayEnrollmentEligibility(record: SubayImportRecord) {
  const year = record.fundingYear
  const simplifiedStatus = getSimplifiedImportStatus(record)

  if (year === 2021) {
    if (simplifiedStatus === 'Ongoing') {
      return {
        eligible: true,
        reason: 'FY 2021 ongoing project included',
      }
    }

    return {
      eligible: false,
      reason: `FY 2021 ${simplifiedStatus} project excluded by import rule`,
    }
  }

  if (year === 2022) {
    return {
      eligible: false,
      reason: 'FY 2022 excluded by import rule',
    }
  }

  if (year && year >= 2023 && year <= 2026) {
    return {
      eligible: true,
      reason: `FY ${year} project included`,
    }
  }

  return {
    eligible: false,
    reason: year
      ? `FY ${year} excluded by import rule`
      : 'Missing funding year excluded by import rule',
  }
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
  if (record.revisedContractExpirationDate && record.status === 'Completed') {
    payload.revised_contract_expiration_date = record.revisedContractExpirationDate
  }

  return payload
}

function getCompositeProjectType(row: unknown[], profile: SubayFormatProfile) {
  const mainType = textValue(getProfileCell(row, profile, 'projectType'))
  const subType = textValue(getProfileCell(row, profile, 'subProjectType'))

  if (mainType && subType && normalizeComparable(mainType) !== normalizeComparable(subType)) {
    return `${mainType} - ${subType}`
  }

  return mainType || subType
}

function getBudget(row: unknown[], profile: SubayFormatProfile) {
  const directBudget = parseNumber(getProfileCell(row, profile, 'budget'))

  if (directBudget > 0) return directBudget

  if (profile.id === 'fy2025_above') {
    // Q and R Original Allocation: National Subsidy + LGU Counterpart
    return parseCurrencyTotal(row[16], row[17])
  }

  if (profile.id === 'fy2024_below') {
    // U and V Original Allocation: National Subsidy + LGU Counterpart
    return parseCurrencyTotal(row[20], row[21])
  }

  return 0
}

function getRecordWarnings(record: Omit<SubayImportRecord, 'validationWarnings'>) {
  const warnings: string[] = []

  if (!record.projectCode) warnings.push('Missing project code')
  if (!record.projectTitle) warnings.push('Missing project title')
  if (!record.fundingYear) warnings.push('Missing funding year')
  if (!record.fundingSource) warnings.push('Missing program/funding source')
  if (!record.province) warnings.push('Missing province')
  if (!record.municipality) warnings.push('Missing city/municipality')
  if (!record.budget && !record.contractAmount) warnings.push('Missing project cost/contract amount')
  if (record.physicalAccomplishment < 0 || record.physicalAccomplishment > 100) {
    warnings.push('Physical accomplishment outside 0-100 range')
  }

  return warnings
}

function parseRecordFromRow(
  row: unknown[],
  rowNumber: number,
  sheetName: string,
  profile: SubayFormatProfile,
): SubayImportRecord | null {
  const projectCode = normalizeProjectCode(getProfileCell(row, profile, 'projectCode'))
  const rawTitle = textValue(getProfileCell(row, profile, 'projectTitle'))

  if (!projectCode && !rawTitle) return null

  const fundingYear = parseFundingYear(getProfileCell(row, profile, 'fundingYear'))
  const physicalValue = getProfileCell(row, profile, 'physicalAccomplishment')
  const physicalAccomplishment = parsePercent(physicalValue)
  const status = normalizeStatus(
    getProfileCell(row, profile, 'status'),
    getProfileCell(row, profile, 'physicalStatus'),
    physicalValue,
  )

  const fundingSource = normalizeProgramName(
    firstNonEmpty(
      getProfileCell(row, profile, 'fundingSource'),
      profile.id === 'fy2025_above' ? getProfileCell(row, profile, 'projectType') : '',
      'SubayBAYAN',
    ),
  )

  const projectTitle = toProjectTitleCase(rawTitle)
  const targetCompletionDate = firstDate(getProfileCell(row, profile, 'targetCompletionDate'))
  const contractExpirationDate = firstDate(getProfileCell(row, profile, 'contractExpirationDate'))
  const ntpDate = firstDate(getProfileCell(row, profile, 'ntpDate'))

  const baseRecord = {
    rowNumber,
    sheetName,
    projectCode,
    projectTitle,
    region: textValue(getProfileCell(row, profile, 'region')),
    province: textValue(getProfileCell(row, profile, 'province')),
    municipality: textValue(getProfileCell(row, profile, 'municipality')),
    barangay: textValue(getProfileCell(row, profile, 'barangay')),
    description: firstNonEmpty(
      getProfileCell(row, profile, 'description'),
      getProfileCell(row, profile, 'exactLocation'),
    ),
    fundingYear,
    fundingSource,
    projectType: getCompositeProjectType(row, profile),
    status,
    physicalAccomplishment,
    financialAccomplishment: parsePercent(getProfileCell(row, profile, 'financialAccomplishment')),
    riskLevel: normalizeRiskLevel(getProfileCell(row, profile, 'riskLevel'), physicalAccomplishment, status),
    implementingOffice: firstNonEmpty(
      getProfileCell(row, profile, 'implementingOffice'),
      getProfileCell(row, profile, 'projectOwner'),
    ),
    contractor: textValue(getProfileCell(row, profile, 'contractor')),
    budget: getBudget(row, profile),
    contractAmount: parseNumber(getProfileCell(row, profile, 'contractAmount')),
    startDate: firstDate(getProfileCell(row, profile, 'startDate'), ntpDate),
    targetCompletionDate,
    contractExpirationDate,
    revisedContractExpirationDate:
      profile.id === 'fy2024_below' && status === 'Completed'
        ? firstDate(getProfileCell(row, profile, 'revisedContractExpirationDate'))
        : null,
    sourceSummary: `${profile.label} · ${sheetName} row ${rowNumber}`,
    subayFormat: profile.id,
    subayFormatLabel: profile.label,
  }

  return {
    ...baseRecord,
    validationWarnings: getRecordWarnings(baseRecord),
  }
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
  let primaryDetectedFormat: SubayDetectedFormat | null = null

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    })

    if (!rows.length) return

    const detectedFormat = detectSheetFormat(rows)

    if (!detectedFormat) {
      issues.push({
        sheetName,
        rowNumber: 0,
        message:
          'Skipped sheet because PMS10 could not confidently detect either SubayBAYAN FY 2024-below or FY 2025-above format.',
      })
      return
    }

    const profile = profileById(detectedFormat.id)

    if (!profile) {
      issues.push({
        sheetName,
        rowNumber: detectedFormat.headerRowNumber,
        message: 'Skipped sheet because detected SubayBAYAN format has no parser profile.',
      })
      return
    }

    if (!primaryDetectedFormat) primaryDetectedFormat = detectedFormat

    detectedSheets.push(
      `${sheetName} — ${detectedFormat.label} (${detectedFormat.confidence}% confidence)`,
    )

    const headerIndex = detectedFormat.headerRowNumber - 1
    const dataStartIndex = headerIndex + profile.dataStartOffset

    rows.slice(dataStartIndex).forEach((row, rowOffset) => {
      const rowNumber = dataStartIndex + rowOffset + 1
      const record = parseRecordFromRow(row, rowNumber, sheetName, profile)

      if (!record) return

      if (!record.projectCode || !record.projectTitle) {
        issues.push({
          sheetName,
          rowNumber,
          message: 'Skipped row because PROJECT CODE or PROJECT TITLE is missing.',
        })
        return
      }

      if (!record.fundingYear) {
        issues.push({
          sheetName,
          rowNumber,
          message: 'Skipped row because FUNDING YEAR is missing.',
        })
        return
      }

      if (record.fundingYear < SUBAY_MIN_FUNDING_YEAR) {
        issues.push({
          sheetName,
          rowNumber,
          message: `Skipped row because funding year ${record.fundingYear} is below FY ${SUBAY_MIN_FUNDING_YEAR}.`,
        })
        return
      }

      const enrollmentEligibility = getSubayEnrollmentEligibility(record)

      if (!enrollmentEligibility.eligible) {
        issues.push({
          sheetName,
          rowNumber,
          message: `${record.projectCode}: ${enrollmentEligibility.reason}.`,
        })
        return
      }

      if (seenCodes.has(record.projectCode)) {
        issues.push({
          sheetName,
          rowNumber,
          message: `Duplicate PROJECT CODE in uploaded file: ${record.projectCode}. Only the first occurrence will be imported.`,
        })
        return
      }

      seenCodes.add(record.projectCode)

      record.validationWarnings.forEach((warning) => {
        issues.push({
          sheetName,
          rowNumber,
          message: `${record.projectCode}: ${warning}.`,
        })
      })

      records.push(record)
    })
  })

  if (!detectedSheets.length) {
    issues.push({
      sheetName: file.name,
      rowNumber: 0,
      message:
        'No supported SubayBAYAN masterlist format was detected. Upload either FY 2024-below or FY 2025-above extract.',
    })
  }

  return {
    records,
    issues,
    detectedSheets,
    detectedFormat: primaryDetectedFormat,
  }
}
