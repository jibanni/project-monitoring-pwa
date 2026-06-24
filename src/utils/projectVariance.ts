type ProjectLike = {
  physical_accomplishment?: number | string | null
  target_physical_accomplishment?: number | string | null
  target_physical_as_of?: string | null
  target_physical_source?: string | null
  start_date?: string | null
  target_completion_date?: string | null
  last_inspection_date?: string | null
  inspection_date?: string | null
  contract_expiration_date?: string | null
  has_contract_modification?: boolean | string | null
  contract_modification_type?: string | null
  revised_project_cost?: number | string | null
  revised_contract_expiration_date?: string | null
}

export type TargetPhysicalInfo = {
  physical: number
  actualPhysical: number
  targetPhysical: number
  variance: number
  label: string
  compactLabel: string
  className: 'ahead' | 'behind' | 'on-track'
  asOfLabel: string
  sourceLabel: string
}

export type ContractExpirationInfo = {
  originalExpirationDate: string | null
  officialExpirationDate: string | null
  hasModification: boolean
  modificationType: string
  revisedExpirationDate: string | null
  isExpired: boolean
  warningMessage: string
  sourceLabel: string
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').replace('%', '').trim())

  return Number.isFinite(parsed) ? parsed : 0
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value

  const normalized = textValue(value).toLowerCase()

  return normalized === 'true' || normalized === 'yes' || normalized === '1'
}

function normalizeDateValue(value: unknown): string | null {
  const rawValue = textValue(value)

  if (!rawValue) return null

  return rawValue.slice(0, 10)
}

function parseDate(value: unknown): Date | null {
  const normalized = normalizeDateValue(value)

  if (!normalized) return null

  const date = new Date(`${normalized}T00:00:00`)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function todayDateOnly(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function clampProgress(value: unknown): number {
  const parsed = toNumber(value)

  if (parsed < 0) return 0
  if (parsed > 100) return 100

  return parsed
}

export function roundVariance(value: unknown): number {
  const parsed = toNumber(value)
  return Math.round(parsed * 100) / 100
}

function formatNumberForPercent(value: number, decimalPlaces = 2): string {
  const rounded = roundVariance(value)

  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  })
}

export function formatSignedVariance(value: unknown, decimalPlaces = 2): string {
  const variance = roundVariance(value)

  if (!Number.isFinite(variance) || variance === 0) return '0%'

  const sign = variance > 0 ? '+' : ''
  return `${sign}${formatNumberForPercent(variance, decimalPlaces)}%`
}

export function formatProgressInput(value: unknown): string {
  if (!hasValue(value)) return ''

  const progress = clampProgress(value)

  if (Number.isInteger(progress)) {
    return String(progress)
  }

  return String(roundVariance(progress))
}

function formatLongDate(value?: string | null): string {
  if (!value) return 'No date'

  const normalized = value.length <= 10 ? `${value}T00:00:00` : value
  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getContractExpirationInfo(
  project?: ProjectLike | null,
  referenceDate?: string | null,
): ContractExpirationInfo {
  const originalExpirationDate = normalizeDateValue(project?.contract_expiration_date)
  const hasModification = toBoolean(project?.has_contract_modification)
  const revisedExpirationDate = normalizeDateValue(project?.revised_contract_expiration_date)
  const modificationType = textValue(project?.contract_modification_type)

  const officialExpirationDate =
    hasModification && revisedExpirationDate ? revisedExpirationDate : originalExpirationDate

  const officialDate = parseDate(officialExpirationDate)
  const reference = parseDate(referenceDate) || todayDateOnly()
  const isExpired = Boolean(officialDate && officialDate.getTime() < reference.getTime())

  return {
    originalExpirationDate,
    officialExpirationDate,
    hasModification,
    modificationType,
    revisedExpirationDate,
    isExpired,
    warningMessage: isExpired
      ? 'The contract period of this project has already expired.'
      : '',
    sourceLabel: hasModification && revisedExpirationDate
      ? 'Revised contract expiration date'
      : 'Original contract expiration date',
  }
}

export function getOfficialProjectCost(project?: ProjectLike | null): number {
  const hasModification = toBoolean(project?.has_contract_modification)
  const revisedCost = toNumber(project?.revised_project_cost)
  const originalCost = toNumber((project as any)?.budget)

  if (hasModification && revisedCost > 0) return revisedCost

  return originalCost
}

export function isContractExpired(project?: ProjectLike | null, referenceDate?: string | null): boolean {
  return getContractExpirationInfo(project, referenceDate).isExpired
}

export function getRiskLevelFromVariance(
  value: unknown,
): 'None' | 'Low' | 'Moderate' | 'High' {
  const variance = roundVariance(value)

  if (!Number.isFinite(variance) || variance >= 0) return 'None'
  if (variance >= -5) return 'Low'
  if (variance > -10) return 'Moderate'

  return 'High'
}

export function getComputedRiskLevel(
  project?: ProjectLike | null,
  referenceDate?: string | null,
): 'None' | 'Low' | 'Moderate' | 'High' {
  if (getContractExpirationInfo(project, referenceDate).isExpired) return 'High'

  return getRiskLevelFromVariance(getTargetPhysicalInfo(project, referenceDate).variance)
}

/*
  Compatibility function only.
  Target Physical is now manual-only.
  This no longer computes time-elapsed target.
*/
export function getAutoTargetPhysical(project?: ProjectLike | null): number {
  if (!project) return 0

  if (hasValue(project.target_physical_accomplishment)) {
    return clampProgress(project.target_physical_accomplishment)
  }

  return 0
}

export function getTargetPhysicalInfo(
  project?: ProjectLike | null,
  asOfDate?: string | null,
): TargetPhysicalInfo {
  const actualPhysical = clampProgress(project?.physical_accomplishment)

  const targetPhysical = hasValue(project?.target_physical_accomplishment)
    ? clampProgress(project?.target_physical_accomplishment)
    : 0

  const variance = roundVariance(actualPhysical - targetPhysical)

  let className: TargetPhysicalInfo['className'] = 'on-track'

  if (variance > 0) className = 'ahead'
  if (variance < 0) className = 'behind'

  const dateSource =
    asOfDate ||
    project?.target_physical_as_of ||
    project?.inspection_date ||
    project?.last_inspection_date ||
    null

  return {
    physical: actualPhysical,
    actualPhysical,
    targetPhysical,
    variance,
    label: formatSignedVariance(variance),
    compactLabel: formatSignedVariance(variance),
    className,
    asOfLabel: dateSource ? `As of ${formatLongDate(dateSource)}` : 'As of inspection',
    sourceLabel: 'Manual target',
  }
}

export function getVarianceClassName(
  value: unknown,
): 'ahead' | 'behind' | 'on-track' {
  const variance = roundVariance(value)

  if (variance > 0) return 'ahead'
  if (variance < 0) return 'behind'

  return 'on-track'
}

export type ProjectRiskLevel = 'None' | 'Low' | 'Moderate' | 'High'

export function getRiskClassName(risk?: string | null): 'none' | 'low' | 'moderate' | 'high' | 'unknown' {
  const normalized = textValue(risk).toLowerCase()

  if (!normalized || normalized === 'none' || normalized.includes('no risk')) return 'none'
  if (normalized.includes('high') || normalized.includes('critical')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'moderate'
  if (normalized.includes('low')) return 'low'

  return 'unknown'
}

export function getProjectDisplayRisk(project?: ProjectLike | null): ProjectRiskLevel {
  return getComputedRiskLevel(project)
}

export function getStatusFromContractModification(
  modificationType?: string | null,
): 'Suspended' | null {
  const normalized = textValue(modificationType).toLowerCase()

  if (normalized.includes('suspension')) return 'Suspended'

  return null
}

export function getProjectDisplayStatus(project?: ProjectLike & { status?: string | null } | null): string {
  const status = textValue(project?.status)
  const normalizedStatus = status.toLowerCase()

  if (normalizedStatus.includes('terminate')) return 'Terminated'
  if (normalizedStatus.includes('suspend')) return 'Suspended'

  return getStatusFromContractModification(project?.contract_modification_type) || status || 'No Status'
}

export function isCriticalProjectStatus(status?: string | null): boolean {
  const normalized = textValue(status).toLowerCase()
  return normalized.includes('suspend') || normalized.includes('terminate')
}

export function isCriticalModificationType(modificationType?: string | null): boolean {
  const normalized = textValue(modificationType).toLowerCase()
  return (
    normalized.includes('variation') ||
    normalized.includes('suspension') ||
    normalized.includes('combination')
  )
}

export function requiresProjectReason(
  status?: string | null,
  modificationType?: string | null,
): boolean {
  const normalizedStatus = textValue(status).toLowerCase()

  return (
    normalizedStatus === 'not yet started' ||
    isCriticalProjectStatus(status) ||
    isCriticalModificationType(modificationType)
  )
}

export function getProjectReasonLabel(
  status?: string | null,
  modificationType?: string | null,
): string {
  const normalizedStatus = textValue(status).toLowerCase()
  const normalizedModification = textValue(modificationType).toLowerCase()

  if (normalizedStatus === 'not yet started') return 'Reason for Not Yet Started'
  if (normalizedStatus.includes('terminate')) return 'Reason for Termination'
  if (normalizedStatus.includes('suspend') || normalizedModification.includes('suspension')) {
    return 'Reason for Suspension Order'
  }
  if (normalizedModification.includes('variation')) return 'Reason for Variation Order'
  if (normalizedModification.includes('combination')) return 'Reason for Contract Modification'

  return 'Reason / Justification'
}
