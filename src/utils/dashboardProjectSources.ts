export function selectSubaybayanOfficialProjects<T extends Record<string, unknown>>(rows: T[]) {
  // This is the official link assigned by the import, not the generic
  // project_code on a manually created project.
  return rows.filter((row) => row.pms10_progress_source !== 'onsite' && typeof row.subaybayan_project_code === 'string' &&
    row.subaybayan_project_code.trim() !== '')
}

export type FieldObservation = {
  project_id: string
  status?: string | null
  physical_accomplishment: number | string | null
  financial_accomplishment: number | string | null
  target_physical_accomplishment?: number | string | null
  risk_level: string | null
  inspection_date: string | null
  inspection_latitude?: number | string | null
  inspection_longitude?: number | string | null
}

function fieldPercent(value: unknown) {
  if (value == null || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null
}

export function buildOnsiteProject<T extends { id: string }>(project: T, field: FieldObservation | undefined) {
  if (!field || String(field.project_id) !== String(project.id)) return null
  const physical = fieldPercent(field.physical_accomplishment)
  const financial = fieldPercent(field.financial_accomplishment)
  const recordedStatus = field.status?.trim()
  if (physical === null && financial === null && !recordedStatus) return null
  const status = physical === 100 ? 'Completed' : recordedStatus ||
    (physical !== null && physical > 0 ? 'Ongoing' : 'Not Yet Started')
  return {
    ...project,
    pms10_progress_source: 'onsite' as const,
    status,
    physical_accomplishment: physical,
    financial_accomplishment: financial,
    target_physical_accomplishment: fieldPercent(field.target_physical_accomplishment),
    target_physical_as_of: field.inspection_date,
    target_physical_source: field.target_physical_accomplishment == null ? null : 'manual',
    risk_level: status.toLowerCase() === 'completed' ? 'None' : field.risk_level || 'None',
    last_inspection_date: field.inspection_date,
    latitude: field.inspection_latitude ?? null,
    longitude: field.inspection_longitude ?? null,
  }
}
