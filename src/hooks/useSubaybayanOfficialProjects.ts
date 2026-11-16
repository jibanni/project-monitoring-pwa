import { useMemo } from 'react'
import { useSharedProjects, type SharedProjectRow } from '../lib/projectDataCache'
import { selectSubaybayanOfficialProjects } from '../utils/dashboardProjectSources'

/** The desktop SubayBAYAN dashboard and RPMES use the same masterlist source. */
export function useSubaybayanOfficialProjects<T extends SharedProjectRow>() {
  const masterlist = useSharedProjects<T>()
  const officialProjects = useMemo(
    () => selectSubaybayanOfficialProjects(masterlist.projects),
    [masterlist.projects],
  )
  return { ...masterlist, officialProjects }
}
