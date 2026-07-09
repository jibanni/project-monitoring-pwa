import { getComputedRiskLevelWithDeadline } from './deadlineRisk'

export type PmsProjectStatus =
  | 'Under Procurement'
  | 'Not Yet Started'
  | 'Ongoing'
  | 'Completed'
  | 'Suspended'
  | 'Terminated'
  | 'Cancelled'

export type PmsRiskLevel = 'None' | 'Low' | 'Moderate' | 'High'

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))

  return Number.isFinite(parsed) ? parsed : 0
}

function normalize(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasText(value: unknown) {
  return textValue(value).length > 0
}

function hasAmount(value: unknown) {
  return toNumber(value) > 0
}

export function getPmsPhysicalAccomplishment(project: Record<string, any>) {
  return toNumber(
    project.physical_accomplishment ??
      project.physical_progress ??
      project.physical_percentage ??
      project.actual_physical ??
      project.total_accomplishment ??
      project.total_accomplishment_percentage ??
      project.accomplishment ??
      project.physical ??
      0,
  )
}

export function hasPmsContractEvidence(project: Record<string, any>) {
  return (
    hasText(project.contractor) ||
    hasText(project.name_of_contractor) ||
    hasText(project.contractor_name) ||
    hasAmount(project.contract_amount) ||
    hasAmount(project.contract_price) ||
    hasAmount(project.awarded_contract_amount) ||
    hasText(project.start_date) ||
    hasText(project.actual_start_date) ||
    hasText(project.ntp_date) ||
    hasText(project.date_of_receipt_of_ntp) ||
    hasText(project.contract_expiration_date) ||
    hasText(project.revised_contract_expiration_date)
  )
}

export function getRawPmsStatusText(project: Record<string, any>) {
  return textValue(
    project.status ??
      project.project_status ??
      project.implementation_status ??
      project.current_status,
  )
}

export function getPmsProjectStatus(project: Record<string, any>): PmsProjectStatus {
  const rawStatus = normalize(getRawPmsStatusText(project))
  const physical = getPmsPhysicalAccomplishment(project)

  if (physical >= 100 || rawStatus.includes('complete')) {
    return 'Completed'
  }

  if (rawStatus.includes('terminat')) return 'Terminated'
  if (rawStatus.includes('cancel')) return 'Cancelled'
  if (rawStatus.includes('suspend')) return 'Suspended'

  if (physical > 0 && physical < 100) {
    return 'Ongoing'
  }

  if (
    rawStatus.includes('ongoing') ||
    rawStatus.includes('on going') ||
    rawStatus.includes('on-going') ||
    rawStatus.includes('under implementation') ||
    rawStatus.includes('implementation')
  ) {
    return 'Ongoing'
  }

  if (hasPmsContractEvidence(project)) {
    return 'Not Yet Started'
  }

  return 'Under Procurement'
}

function normalizeRiskLevel(value: unknown): PmsRiskLevel {
  const risk = normalize(value)

  if (!risk || risk.includes('none') || risk.includes('no risk')) return 'None'
  if (risk.includes('high')) return 'High'
  if (risk.includes('moderate') || risk.includes('medium')) return 'Moderate'
  if (risk.includes('low')) return 'Low'

  return 'None'
}

export function getPmsRiskLevel(project: Record<string, any>): PmsRiskLevel {
  const status = getPmsProjectStatus(project)
  const physical = getPmsPhysicalAccomplishment(project)

  if (status === 'Completed' || physical >= 100) {
    return 'None'
  }

  return normalizeRiskLevel(getComputedRiskLevelWithDeadline(project))
}

export function isPmsHighRisk(project: Record<string, any>) {
  return getPmsRiskLevel(project) === 'High'
}

export function isPmsCriticalStatus(project: Record<string, any>) {
  const status = getPmsProjectStatus(project)

  return (
    status === 'Suspended' ||
    status === 'Terminated' ||
    status === 'Cancelled'
  )
}
