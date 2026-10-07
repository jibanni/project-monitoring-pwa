import { getOfficialProjectCost } from './projectVariance'

type ProjectLike = Record<string, any>

function textValue(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeTitle(value: unknown) {
  return textValue(value)
    .toLowerCase()
    .replace(/[<>[\]{}()]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isPlaceholderProjectTitle(projectOrTitle: ProjectLike | unknown) {
  const value =
    projectOrTitle && typeof projectOrTitle === 'object'
      ? (projectOrTitle as ProjectLike).project_name ??
        (projectOrTitle as ProjectLike).project_title ??
        (projectOrTitle as ProjectLike).title
      : projectOrTitle

  const normalized = normalizeTitle(value)
  return normalized.includes('please insert project title')
}

export function hasUsableProjectCost(project: ProjectLike) {
  return getOfficialProjectCost(project) > 0
}

export function isProjectEligibleForAggregatePerformance(project: ProjectLike) {
  return !isPlaceholderProjectTitle(project) && hasUsableProjectCost(project)
}
