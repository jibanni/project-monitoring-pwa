export type AorProjectLike = {
  province?: unknown
  municipality?: unknown
}

export type AorProfileLike = {
  role?: string | null
  approved?: boolean | null
  aor_level?: string | null
  province?: string | null
  huc?: string | null
  city?: string | null
  municipality?: string | null
  is_active?: boolean | null
}

export type AorAssignmentLike = {
  province?: string | null
  municipality?: string | null
  is_active?: boolean | null
}

export type AorAuthLike = {
  profile?: AorProfileLike | null
  isAdmin?: boolean
  isROEngineer?: boolean
  isPOEngineer?: boolean
  isEngineer?: boolean
  isRD?: boolean
  isARD?: boolean
  isPD?: boolean
  isCD?: boolean
  isCLGOO?: boolean
  isMLGOO?: boolean
  isPEO?: boolean
  isViewer?: boolean
  poEngineerLguAssignments?: AorAssignmentLike[]
  roEngineerProvinceAssignments?: AorAssignmentLike[]
}

export function textKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function getCanonicalRole(role: string | null | undefined) {
  const value = textKey(role)

  if (value === 'admin') return 'Admin'
  if (value === 'ro engineer' || value === 'ro engineers') return 'RO Engineer'
  if (value === 'engineer' || value === 'po engineer' || value === 'po engineers') {
    return 'PO Engineer'
  }
  if (value === 'rd' || value === 'regional director') return 'RD'
  if (value === 'ard' || value === 'assistant regional director') return 'ARD'
  if (value === 'pd' || value === 'provincial director') return 'PD'
  if (value === 'cd' || value === 'city director') return 'CD'
  if (value === 'clgoo') return 'CLGOO'
  if (value === 'mlgoo') return 'MLGOO'
  if (value === 'peo' || value === 'project evaluation officer') return 'PEO'
  if (value === 'pdmu chief' || value === 'pdmu') return 'PDMU Chief'
  if (value === 'viewer') return 'Viewer'

  return String(role || '').trim()
}

function isActiveApproved(profile: AorProfileLike | null | undefined) {
  return profile?.approved === true && profile?.is_active !== false
}

function sameText(left: unknown, right: unknown) {
  const leftKey = textKey(left)
  const rightKey = textKey(right)
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function projectMatchesProvince(project: AorProjectLike, province: unknown) {
  return sameText(project.province, province)
}

function projectMatchesMunicipality(project: AorProjectLike, municipality: unknown) {
  return sameText(project.municipality, municipality)
}

function getActivePoAssignments(auth: AorAuthLike | null | undefined) {
  return (auth?.poEngineerLguAssignments || []).filter(
    (assignment) => assignment.is_active !== false,
  )
}

function getActiveRoAssignments(auth: AorAuthLike | null | undefined) {
  return (auth?.roEngineerProvinceAssignments || []).filter(
    (assignment) => assignment.is_active !== false,
  )
}

function hasRegionalView(role: string) {
  return role === 'Admin' || role === 'RD' || role === 'ARD' || role === 'PDMU Chief'
}

function canAccessRoProvince(project: AorProjectLike, auth: AorAuthLike) {
  const assignments = getActiveRoAssignments(auth)

  if (assignments.length > 0) {
    return assignments.some((assignment) =>
      projectMatchesProvince(project, assignment.province),
    )
  }

  return projectMatchesProvince(project, auth.profile?.province)
}

function canAccessPoLgu(project: AorProjectLike, auth: AorAuthLike) {
  const assignments = getActivePoAssignments(auth)

  if (assignments.length > 0) {
    return assignments.some(
      (assignment) =>
        projectMatchesProvince(project, assignment.province) &&
        projectMatchesMunicipality(project, assignment.municipality),
    )
  }

  return (
    projectMatchesProvince(project, auth.profile?.province) &&
    projectMatchesMunicipality(project, auth.profile?.municipality)
  )
}

function canViewByAorLevel(project: AorProjectLike, profile: AorProfileLike) {
  const aorLevel = textKey(profile.aor_level)

  if (aorLevel === 'regional') return true

  if (aorLevel === 'province' || aorLevel === 'provincial') {
    return projectMatchesProvince(project, profile.province)
  }

  if (aorLevel === 'huc') {
    return projectMatchesMunicipality(project, profile.huc)
  }

  if (aorLevel === 'city') {
    return projectMatchesMunicipality(project, profile.city)
  }

  if (aorLevel === 'municipality' || aorLevel === 'municipality / lgu') {
    return projectMatchesMunicipality(project, profile.municipality)
  }

  if (aorLevel === 'assigned lgu' || aorLevel === 'assigned lgu/s') {
    return (
      projectMatchesProvince(project, profile.province) &&
      projectMatchesMunicipality(project, profile.municipality)
    )
  }

  if (profile.huc && projectMatchesMunicipality(project, profile.huc)) return true
  if (profile.city && projectMatchesMunicipality(project, profile.city)) return true
  if (profile.municipality && projectMatchesMunicipality(project, profile.municipality)) {
    return true
  }
  if (profile.province && projectMatchesProvince(project, profile.province)) return true

  return false
}

export function canViewProject(project: AorProjectLike, auth: AorAuthLike | null | undefined) {
  const profile = auth?.profile

  if (!profile) return false
  if (!isActiveApproved(profile)) return false

  const role = getCanonicalRole(profile?.role)
  const currentAuth: AorAuthLike = auth || { profile }

  if (currentAuth.isAdmin || hasRegionalView(role)) return true

  if (currentAuth.isROEngineer || role === 'RO Engineer') {
    return canAccessRoProvince(project, currentAuth)
  }

  if (currentAuth.isPOEngineer || currentAuth.isEngineer || role === 'PO Engineer') {
    return canAccessPoLgu(project, currentAuth)
  }

  if (currentAuth.isPD || role === 'PD' || currentAuth.isPEO || role === 'PEO') {
    return projectMatchesProvince(project, profile?.province)
  }

  if (currentAuth.isCD || role === 'CD') {
    return projectMatchesMunicipality(project, profile?.huc)
  }

  if (currentAuth.isCLGOO || role === 'CLGOO') {
    return projectMatchesMunicipality(project, profile?.city)
  }

  if (currentAuth.isMLGOO || role === 'MLGOO') {
    return projectMatchesMunicipality(project, profile?.municipality)
  }

  return canViewByAorLevel(project, profile)
}

export function canUpdateProject(
  project: AorProjectLike,
  auth: AorAuthLike | null | undefined,
) {
  const profile = auth?.profile

  if (!profile) return false
  if (!isActiveApproved(profile)) return false

  const role = getCanonicalRole(profile.role)
  const currentAuth: AorAuthLike = auth || { profile }

  if (currentAuth.isAdmin || role === 'Admin') return true

  if (currentAuth.isROEngineer || role === 'RO Engineer') {
    return canAccessRoProvince(project, currentAuth)
  }

  if (currentAuth.isPOEngineer || currentAuth.isEngineer || role === 'PO Engineer') {
    return canAccessPoLgu(project, currentAuth)
  }

  return false
}

export function filterProjectsByAor<T extends AorProjectLike>(
  projects: T[],
  auth: AorAuthLike | null | undefined,
) {
  return projects.filter((project) => canViewProject(project, auth))
}
