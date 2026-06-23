export type AorProjectLike = {
  province?: unknown
  municipality?: unknown
  city?: unknown
  huc?: unknown
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
  city?: string | null
  huc?: string | null
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

function displayText(value: unknown) {
  return String(value ?? '').trim()
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
  if (value === 'clgoo' || value === 'city local government operations officer') return 'CLGOO'
  if (value === 'mlgoo' || value === 'municipal local government operations officer') return 'MLGOO'
  if (value === 'peo' || value === 'project evaluation officer') return 'PEO'
  if (
    value === 'pdmu chief' ||
    value === 'pdmu chief/head' ||
    value === 'pdmu head' ||
    value === 'pdmu'
  ) {
    return 'PDMU Chief'
  }
  if (value === 'viewer') return 'Viewer'

  return displayText(role)
}

function isActiveApproved(profile: AorProfileLike | null | undefined) {
  return profile?.approved === true && profile?.is_active !== false
}

function sameText(left: unknown, right: unknown) {
  const leftKey = textKey(left)
  const rightKey = textKey(right)

  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function uniqueCleanValues(values: unknown[]) {
  const seen = new Set<string>()
  const output: string[] = []

  values.forEach((value) => {
    const label = displayText(value)
    const key = textKey(label)

    if (!key || seen.has(key)) return

    seen.add(key)
    output.push(label)
  })

  return output
}

function projectMatchesProvince(project: AorProjectLike, province: unknown) {
  return sameText(project.province, province)
}

function projectMatchesMunicipality(project: AorProjectLike, municipality: unknown) {
  return sameText(project.municipality, municipality)
}

function projectMatchesCity(project: AorProjectLike, city: unknown) {
  return sameText(project.municipality, city) || sameText(project.city, city)
}

function projectMatchesHuc(project: AorProjectLike, huc: unknown) {
  return sameText(project.municipality, huc) || sameText(project.huc, huc)
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

export function getRoEngineerAllowedProvinces(auth: AorAuthLike | null | undefined) {
  const assignments = getActiveRoAssignments(auth)

  const assignedProvinces =
    assignments.length > 0
      ? assignments.map((assignment) => assignment.province)
      : [auth?.profile?.province]

  return uniqueCleanValues(assignedProvinces)
}

export function getPoEngineerAllowedLgus(auth: AorAuthLike | null | undefined) {
  const assignments = getActivePoAssignments(auth)

  if (assignments.length > 0) {
    return assignments
      .filter((assignment) => displayText(assignment.province) && displayText(assignment.municipality))
      .map((assignment) => ({
        province: displayText(assignment.province),
        municipality: displayText(assignment.municipality),
      }))
  }

  const province = displayText(auth?.profile?.province)
  const municipality = displayText(auth?.profile?.municipality)

  if (!province || !municipality) return []

  return [{ province, municipality }]
}

function canAccessRoProvince(project: AorProjectLike, auth: AorAuthLike) {
  const allowedProvinces = getRoEngineerAllowedProvinces(auth)

  if (allowedProvinces.length === 0) return false

  return allowedProvinces.some((province) => projectMatchesProvince(project, province))
}

function canAccessPoLgu(project: AorProjectLike, auth: AorAuthLike) {
  const allowedLgus = getPoEngineerAllowedLgus(auth)

  if (allowedLgus.length === 0) return false

  return allowedLgus.some(
    (assignment) =>
      projectMatchesProvince(project, assignment.province) &&
      projectMatchesMunicipality(project, assignment.municipality),
  )
}

function canViewByAorLevel(project: AorProjectLike, profile: AorProfileLike) {
  const aorLevel = textKey(profile.aor_level)

  if (aorLevel === 'regional') return true

  if (aorLevel === 'province' || aorLevel === 'provincial') {
    return projectMatchesProvince(project, profile.province)
  }

  if (aorLevel === 'huc') {
    return projectMatchesHuc(project, profile.huc)
  }

  if (aorLevel === 'city') {
    return projectMatchesCity(project, profile.city)
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

  if (profile.huc && projectMatchesHuc(project, profile.huc)) return true
  if (profile.city && projectMatchesCity(project, profile.city)) return true
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

  const role = getCanonicalRole(profile.role)
  const currentAuth: AorAuthLike = auth || { profile }

  if (currentAuth.isAdmin || hasRegionalView(role)) return true

  if (currentAuth.isROEngineer || role === 'RO Engineer') {
    return canAccessRoProvince(project, currentAuth)
  }

  if (currentAuth.isPOEngineer || currentAuth.isEngineer || role === 'PO Engineer') {
    return canAccessPoLgu(project, currentAuth)
  }

  if (currentAuth.isPD || role === 'PD' || currentAuth.isPEO || role === 'PEO') {
    return projectMatchesProvince(project, profile.province)
  }

  if (currentAuth.isCD || role === 'CD') {
    return projectMatchesHuc(project, profile.huc)
  }

  if (currentAuth.isCLGOO || role === 'CLGOO') {
    return projectMatchesCity(project, profile.city)
  }

  if (currentAuth.isMLGOO || role === 'MLGOO') {
    return projectMatchesMunicipality(project, profile.municipality)
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

export function canEditProjectRecord(
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

  return false
}

export function canCreateProjectInAor(
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

  return false
}

export function filterProjectsByAor<T extends AorProjectLike>(
  projects: T[],
  auth: AorAuthLike | null | undefined,
) {
  return projects.filter((project) => canViewProject(project, auth))
}