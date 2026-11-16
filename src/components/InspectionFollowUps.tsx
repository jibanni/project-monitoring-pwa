import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { canUpdateProject } from '../utils/aorAccess'
import {
  FOLLOW_UP_PILOT_PROVINCE, FOLLOW_UP_STATUSES, dateOnly, followUpDateLabel, followUpTiming,
  inspectionCandidates, inspectionLink, manilaToday, sourceKey, validEvidenceUrl,
} from '../utils/inspectionFollowUps'
import type {
  FollowUp, FollowUpCandidate, FollowUpStatus, FollowUpTiming, InspectionSource,
} from '../utils/inspectionFollowUps'
import '../styles/inspectionFollowUps.css'

const projectSelect = 'project:projects!inner(id,project_name,province,municipality)'
const timingLabels: Record<FollowUpTiming, string> = {
  overdue: 'Overdue', due_soon: 'Due within 7 days', later: 'Due later',
  unscheduled: 'No due date', resolved: 'Resolved',
}
const timingRank: Record<FollowUpTiming, number> = {
  overdue: 0, due_soon: 1, later: 2, unscheduled: 3, resolved: 4,
}
type Filter = 'all' | FollowUpTiming
type Editor = { item: FollowUp } | { candidate: FollowUpCandidate }
type Snapshot = { rows: FollowUp[]; error: string; today: string }
type SourceSnapshot = { candidates: FollowUpCandidate[]; error: string }

async function readFollowUps(signal: AbortSignal) {
  const rows: FollowUp[] = []
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.from('inspection_followups')
      .select(`id,project_id,source_update_id,source_item,recommendation,responsible_person,due_date,status,resolution_note,evidence_url,updated_at,${projectSelect}`)
      .order('id').range(offset, offset + 199).abortSignal(signal)
    if (error) throw error
    const page = (data ?? []) as unknown as FollowUp[]
    rows.push(...page)
    if (page.length < 200) return rows
  }
}

async function readCandidates(signal: AbortSignal) {
  const candidates: FollowUpCandidate[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from('project_updates')
      .select(`id,project_id,inspection_date,recommendations,remarks,${projectSelect}`)
      .ilike('project.province', FOLLOW_UP_PILOT_PROVINCE)
      .not('recommendations', 'is', null)
      .order('inspection_date', { ascending: false, nullsFirst: false })
      .order('id').range(offset, offset + 99).abortSignal(signal)
    if (error) throw error
    for (const source of (data ?? []) as unknown as InspectionSource[]) {
      candidates.push(...inspectionCandidates(source))
    }
    if ((data?.length ?? 0) < 100) return candidates
  }
}

function FollowUpEditor({ entry, onDismiss, onSave }: {
  entry: Editor; onDismiss: () => void; onSave: () => void
}) {
  const item = 'item' in entry ? entry.item : undefined
  const candidate = 'candidate' in entry ? entry.candidate : undefined
  const [responsible, setResponsible] = useState(item?.responsible_person ?? '')
  const [due, setDue] = useState(item?.due_date ?? candidate?.suggestedDate ?? '')
  const [status, setStatus] = useState<FollowUpStatus>(item?.status ?? 'open')
  const [note, setNote] = useState(item?.resolution_note ?? '')
  const [evidence, setEvidence] = useState(item?.evidence_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const ref = useRef<HTMLDialogElement>(null)
  const title = useId()

  useEffect(() => { ref.current?.showModal() }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const dueDate = dateOnly(due)
    if (due && !dueDate) { setError('Enter a valid due date.'); return }
    const resolution = status === 'resolved' ? note.trim() : ''
    const url = status === 'resolved' ? evidence.trim() : ''
    if (status === 'resolved' && !resolution && !url) {
      setError('Add a resolution note or an evidence link before resolving this action.'); return
    }
    if (url && !validEvidenceUrl(url)) { setError('Enter a valid HTTPS evidence link.'); return }

    setError('')
    setBusy(true)
    pending.current = true
    try {
      const details = { responsible_person: responsible.trim() || null, due_date: dueDate || null }
      if (candidate) {
        const { error } = await supabase.from('inspection_followups').insert({
          project_id: candidate.source.project_id, source_update_id: candidate.source.id,
          source_item: candidate.number, recommendation: candidate.recommendation, ...details,
        })
        if (error?.code === '23505') {
          onSave()
          return
        }
        if (error) throw error
      } else if (item) {
        const { data, error } = await supabase.from('inspection_followups').update({
          ...details, status, resolution_note: resolution || null, evidence_url: url || null,
        }).eq('id', item.id).eq('updated_at', item.updated_at).select('id').maybeSingle()
        if (error) throw error
        if (!data) {
          setError('This action changed or you no longer have write access. Close and refresh the tracker before retrying.')
          return
        }
      }
      onSave()
    } catch {
      setError('The action could not be saved. Check your connection and project access, then try again.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <dialog className="pms-fu-modal" ref={ref} aria-labelledby={title}
    onCancel={(event) => { event.preventDefault(); if (!pending.current) onDismiss() }}>
    <form onSubmit={submit}>
      <h3 id={title}>{candidate ? 'Track recommendation' : 'Manage follow-up'}</h3>
      <p className="pms-fu-recommendation">{candidate?.recommendation ?? item?.recommendation}</p>
      <label>Responsible person or office<input autoFocus maxLength={180} value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="e.g. Municipal Engineering Office" /></label>
      <label>Due date<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
      {candidate && !candidate.suggestedDate && <p className="pms-fu-hint">No unambiguous date could be copied from this inspection. Enter one or leave it unscheduled.</p>}
      {item && <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as FollowUpStatus)}>
        {Object.entries(FOLLOW_UP_STATUSES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>}
      {status === 'resolved' && <>
        <label>Resolution note<textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <label>Evidence link<input type="url" maxLength={2048} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="https://…" /></label>
        <p className="pms-fu-hint">Provide at least one. Reopening an action clears its current resolution details.</p>
      </>}
      {error && <p role="alert" className="pms-fu-error">{error}</p>}
      <div className="pms-fu-modal-actions">
        <button type="button" disabled={busy} onClick={onDismiss}>Cancel</button>
        <button type="submit" disabled={busy} className="pms-fu-primary">{busy ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </form>
  </dialog>
}

function Bell() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" />
  </svg>
}

export default function InspectionFollowUps({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const auth = useAuth()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [sources, setSources] = useState<SourceSnapshot | null>(null)
  const [expanded, setExpanded] = useState(defaultOpen)
  const [showSources, setShowSources] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [displayCount, setDisplayCount] = useState(25)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const editorTrigger = useRef<HTMLElement | null>(null)
  const panelId = useId()
  const sourceId = useId()

  useEffect(() => {
    let current: AbortController | undefined
    async function refresh() {
      if (document.visibilityState === 'hidden') return
      current?.abort()
      const controller = new AbortController()
      const { signal } = controller
      current = controller
      try {
        if (!navigator.onLine) throw new Error('Offline')
        const rows = await readFollowUps(signal)
        if (!signal.aborted) setSnapshot({ rows, error: '', today: manilaToday() })
      } catch {
        if (!signal.aborted) setSnapshot((last) => ({
          rows: last?.rows ?? [], today: manilaToday(), error: navigator.onLine
            ? 'Follow-ups could not be loaded. Use Refresh to try again.'
            : 'You are offline. Reconnect to refresh reminders or save changes.',
        }))
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      current?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [revision])

  useEffect(() => {
    if (!showSources || !expanded) return
    const controller = new AbortController()
    void readCandidates(controller.signal).then((candidates) => {
      if (!controller.signal.aborted) setSources({ candidates, error: '' })
    }).catch(() => {
      if (!controller.signal.aborted) setSources({ candidates: [], error: 'Inspection recommendations could not be loaded.' })
    })
    return () => controller.abort()
  }, [showSources, expanded, revision])

  const { rows, counts, tracked } = useMemo(() => {
    const counts: Record<FollowUpTiming, number> = { overdue: 0, due_soon: 0, later: 0, unscheduled: 0, resolved: 0 }
    const tracked = new Set<string>()
    const rows = (snapshot?.rows ?? []).map((item) => {
      const timing = followUpTiming(item, snapshot?.today ?? manilaToday())
      counts[timing] += 1
      if (item.source_update_id) tracked.add(sourceKey(item.source_update_id, item.source_item))
      return { item, timing }
    }).sort((a, b) => timingRank[a.timing] - timingRank[b.timing] ||
      (a.item.due_date ?? '9999').localeCompare(b.item.due_date ?? '9999') ||
      a.item.project.project_name.localeCompare(b.item.project.project_name))
    return { rows, counts, tracked }
  }, [snapshot])

  const matched = rows.filter(({ timing }) => filter === 'all' ? timing !== 'resolved' : timing === filter)
  const candidates = (sources?.candidates ?? []).filter((item) =>
    canUpdateProject(item.source.project, auth) && !tracked.has(sourceKey(item.source.id, item.number)))
  const urgent = counts.overdue + counts.due_soon
  const fresh = snapshot && !snapshot.error
  const canEdit = (item: FollowUp) => fresh && canUpdateProject(item.project, auth)
  const chooseFilter = (value: Filter) => { setFilter(value); setDisplayCount(25) }
  const refresh = () => setRevision((value) => value + 1)
  const closeEditor = () => {
    setEditor(null)
    requestAnimationFrame(() => {
      const trigger = editorTrigger.current
      if (trigger?.isConnected) trigger.focus()
      else document.getElementById(panelId)?.focus()
    })
  }
  const save = () => {
    closeEditor()
    setNotice('Follow-up list updated.')
    refresh()
  }

  return <section className="pms-fu" aria-label="Inspection follow-ups">
    <button type="button" className="pms-fu-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)}>
      <span className="pms-fu-bell"><Bell /><span className="pms-fu-badge" hidden={!fresh || !urgent}>{urgent}</span></span>
      <span className="pms-fu-title"><strong>Inspection Follow-ups</strong><small>Bukidnon pilot</small></span>
      <span className="pms-fu-notification" aria-live="polite" aria-atomic="true">
        {fresh ? `${counts.overdue} overdue · ${counts.due_soon} due within 7 days` : snapshot ? 'Reminders unavailable' : 'Checking reminders…'}
      </span>
      <span className="pms-fu-chevron" aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
    </button>
    <div id={panelId} className="pms-fu-body" tabIndex={-1} hidden={!expanded}>
      <div className="pms-fu-toolbar">
        <div role="group" aria-label="Filter follow-ups" className="pms-fu-filters">
          {(['all', 'overdue', 'due_soon', 'later', 'unscheduled', 'resolved'] as Filter[]).map((key) =>
            <button type="button" key={key} aria-pressed={filter === key} onClick={() => chooseFilter(key)}>
              {key === 'all' ? 'Active' : timingLabels[key]}{snapshot ? ` (${key === 'all' ? rows.length - counts.resolved : counts[key]})` : ''}
            </button>)}
        </div>
        <button type="button" onClick={refresh}>Refresh</button>
      </div>
      <p className="pms-fu-hint">Reminders reflect tracked actions in projects you can access. Inspection findings can stay open even after a project is completed.</p>
      {snapshot?.error && <p className="pms-fu-error" role="status">{snapshot.error}</p>}
      {notice && <p className="pms-fu-hint" role="status">{notice}</p>}
      {!snapshot ? <p role="status">Loading follow-ups…</p> : matched.length ? <>
        <div className="pms-fu-table-wrap">
          <table>
            <thead><tr><th scope="col">Project and LGU</th><th scope="col">Recommendation</th><th scope="col">Responsible</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
            <tbody>{matched.slice(0, displayCount).map(({ item, timing }) => <tr key={item.id}>
              <td><Link to={inspectionLink(item.project_id, item.source_update_id)}>{item.project.project_name}</Link><small>{item.project.municipality || FOLLOW_UP_PILOT_PROVINCE}{!item.source_update_id ? ' · Original inspection removed' : ''}</small></td>
              <td className="pms-fu-recommendation">{item.recommendation}{item.resolution_note && <small>Resolution · {item.resolution_note}</small>}
                {item.evidence_url && validEvidenceUrl(item.evidence_url) && <small><a href={item.evidence_url} target="_blank" rel="noopener noreferrer">Open evidence ↗</a></small>}</td>
              <td>{item.responsible_person || 'Unassigned'}</td>
              <td>{followUpDateLabel(item.due_date)}</td>
              <td><span className={`pms-fu-pill is-${timing}`}>{FOLLOW_UP_STATUSES[item.status]}</span>
                {timing === 'overdue' || timing === 'due_soon' ? <small>{timingLabels[timing]}</small> : null}</td>
              <td>{canEdit(item) ? <button type="button" onClick={(event) => { editorTrigger.current = event.currentTarget; setEditor({ item }) }} aria-label={`Manage follow-up for ${item.project.project_name}`}>Manage</button> : <span>View only</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {matched.length > displayCount && <button type="button" onClick={() => setDisplayCount((n) => n + 25)}>Show more</button>}
      </> : !snapshot.error && <p className="pms-fu-empty">No follow-ups match this filter.</p>}

      {fresh && (auth.isAdmin || auth.isROEngineer || auth.isPOEngineer || auth.isPEO) && <div className="pms-fu-candidates">
        <button type="button" aria-expanded={showSources} aria-controls={sourceId} onClick={() => setShowSources((value) => !value)}>Track an inspection recommendation</button>
        <div id={sourceId} hidden={!showSources}>
          <p className="pms-fu-hint">Choose which existing recommendations to track. Older inspection notes do not trigger reminders automatically.</p>
          {sources?.error && <p className="pms-fu-error" role="status">{sources.error}</p>}
          {!sources ? <p role="status">Loading inspection recommendations…</p>
            : !sources.error && !candidates.length ? <p>No untracked recommendations in your writable Bukidnon projects.</p>
            : <ul>{candidates.map((candidate) => <li key={sourceKey(candidate.source.id, candidate.number)}>
              <div><Link to={inspectionLink(candidate.source.project_id, candidate.source.id)}>{candidate.source.project.project_name}</Link>
              <small>{candidate.source.project.municipality || FOLLOW_UP_PILOT_PROVINCE} · {followUpDateLabel(candidate.source.inspection_date)}</small>
              <p className="pms-fu-recommendation">{candidate.recommendation}</p></div>
              <button type="button" onClick={(event) => { editorTrigger.current = event.currentTarget; setEditor({ candidate }) }} disabled={candidate.recommendation.length > 8000}
                title={candidate.recommendation.length > 8000 ? 'This recommendation exceeds the 8,000-character tracker limit.' : undefined}>Track</button>
            </li>)}</ul>}
        </div>
      </div>}
    </div>
    {editor && <FollowUpEditor entry={editor} onDismiss={closeEditor} onSave={save} />}
  </section>
}
