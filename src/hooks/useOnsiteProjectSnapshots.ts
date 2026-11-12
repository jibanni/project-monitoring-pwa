import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export type ProjectWithId = {
  id: string
}

type SiteUpdate = {
  project_id: string
  physical_accomplishment: number | string | null
  financial_accomplishment: number | string | null
  risk_level: string | null
  inspection_date: string | null
  created_at: string | null
}

const PAGE_SIZE = 500

function progress(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null
}

/**
 * The official projects masterlist is never modified by this hook.
 * Actual on-site figures are taken exclusively from the latest saved
 * project_updates record for each project, not the imported masterlist.
 * No update = no on-site snapshot, rather than a false 0% observation.
 */
export function useOnsiteProjectSnapshots<T extends ProjectWithId>(
  officialProjects: T[],
  enabled: boolean,
) {
  const [updates, setUpdates] = useState<Map<string, SiteUpdate>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let active = true
    setLoading(true)
    setError('')
    const load = async () => {
      try {
        const latest = new Map<string, SiteUpdate>()
        for (let start = 0; ; start += PAGE_SIZE) {
          const { data, error: loadError } = await supabase
            .from('project_updates')
            .select('project_id, physical_accomplishment, financial_accomplishment, risk_level, inspection_date, created_at')
            .order('inspection_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(start, start + PAGE_SIZE - 1)
          if (loadError) throw loadError
          const page = (data || []) as SiteUpdate[]
          // Descending global order: first row is the newest for that project.
          for (const item of page) {
            const key = String(item.project_id || '')
            if (key && !latest.has(key)) latest.set(key, item)
          }
          if (page.length < PAGE_SIZE) break
        }
        if (active) setUpdates(latest)
      } catch (problem) {
        if (active) setError(problem instanceof Error ? problem.message : String(problem))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [enabled])

  const onsiteProjects = useMemo(() => officialProjects.flatMap((project) => {
    const observation = updates.get(String(project.id))
    if (!observation) return []
    const physicalValue = progress(observation.physical_accomplishment)
    const financialValue = progress(observation.financial_accomplishment)
    if (physicalValue === null && financialValue === null) return []
    const siteStatus = physicalValue === null
      ? 'Not Yet Started'
      : physicalValue >= 100
        ? 'Completed'
        : physicalValue > 0
          ? 'Ongoing'
          : 'Not Yet Started'
    return [{
      ...project,
      status: siteStatus,
      physical_accomplishment: physicalValue,
      financial_accomplishment: financialValue,
      risk_level: physicalValue === 100 ? 'None' : observation.risk_level || 'None',
      last_inspection_date: observation.inspection_date,
    } as T]
  }), [officialProjects, updates])

  return { onsiteProjects, onsiteLoading: loading, onsiteError: error }
}
