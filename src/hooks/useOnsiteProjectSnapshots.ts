import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildOnsiteProject, type FieldObservation } from '../utils/dashboardProjectSources'

export type ProjectWithId = {
  id: string
}

const PAGE_SIZE = 500

/**
 * The official projects masterlist is never modified by this hook.
 * Actual on-site figures are taken exclusively from the latest saved
 * project_updates record for each project, not the imported masterlist.
 * No update = no on-site snapshot, rather than a false 0% observation.
 */
export function useOnsiteProjectSnapshots<T extends ProjectWithId>(
  masterlistProjects: T[],
  enabled: boolean,
) {
  const [updates, setUpdates] = useState<Map<string, FieldObservation>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setUpdates(new Map())
    setLoading(true)
    setError('')
    const load = async () => {
      try {
        const latest = new Map<string, FieldObservation>()
        for (let start = 0; ; start += PAGE_SIZE) {
          const { data, error: loadError } = await supabase
            .from('project_updates')
            .select('project_id, status, physical_accomplishment, financial_accomplishment, target_physical_accomplishment, risk_level, inspection_date, inspection_latitude, inspection_longitude')
            .order('inspection_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false })
            .range(start, start + PAGE_SIZE - 1)
            .abortSignal(controller.signal)
          if (loadError) throw loadError
          const page = (data || []) as FieldObservation[]
          // Descending global order: first row is the newest for that project.
          for (const item of page) {
            const key = String(item.project_id || '')
            if (key && !latest.has(key)) latest.set(key, item)
          }
          if (page.length < PAGE_SIZE) break
        }
        if (!controller.signal.aborted) setUpdates(latest)
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : String(problem))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [enabled])

  const onsiteProjects = useMemo(() => enabled ? masterlistProjects.flatMap((project) => {
    const snapshot = buildOnsiteProject(project, updates.get(String(project.id)))
    return snapshot ? [snapshot] : []
  }) : [], [enabled, masterlistProjects, updates])

  return { onsiteProjects, onsiteLoading: loading, onsiteError: error }
}
