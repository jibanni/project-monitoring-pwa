import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { OfflineAideMemoire } from '../lib/offlineDb'
import type { RemovableProjectItem } from '../services/adminProjectItemService'
import { getDriveImageOpenUrl, getDriveImagePreviewUrl } from '../utils/driveImageUrl'
import '../styles/desktopProjectDetails.css'

const TABS = [
  ['overview', 'Overview'],
  ['contract', 'Contract & Funding'],
  ['inspections', 'Inspections'],
  ['files', 'Files & Photos'],
] as const
type Section = (typeof TABS)[number][0]
const HISTORY_PAGE_SIZE = 8
const SITE_PREFIX = /^\s*Update Type:\s*Site Update\b/i
const OFFICE_PREFIX = /^\s*Update Type:\s*Office Update\b/i
const UPDATE_PREFIX = /^\s*Update Type:\s*(Site Update|Office Update)\b[ \t]*(?:\r?\n[ \t]*)*/i

type RecordValues = Record<string, unknown>
export type DesktopProjectUpdate = RecordValues & {
  id?: string | number
  local_id?: string | null
  online_update_id?: string | null
  inspection_date?: string | null
  created_at?: string | null
  remarks?: string | null
  is_offline?: boolean
  synced?: boolean
  sync_status?: string | null
}

type SupportingPhoto = {
  id: string | number
  photo_url: string | null
  caption?: string | null
  uploaded_at?: string | null
}

type FileItem = { id: string; name: string; format: string; date: string; detail: string; open: () => void; removal?: RemovableProjectItem }
type DraftItem = { updatedAt: string; inspectionDate?: string }

type Props = {
  projectId: string
  project: RecordValues
  location: string
  program: string
  fundingYear: string
  projectCode: string
  copiedCode: boolean
  status: string
  riskLabel: string
  riskTone: 'none' | 'low' | 'moderate' | 'high'
  officialCost: number
  offline: boolean
  updates: DesktopProjectUpdate[]
  localAideRecords: ReadonlyMap<string, OfflineAideMemoire>
  files: FileItem[]
  fileLimit: number
  photos: SupportingPhoto[]
  photosHaveMore: boolean
  photosLoading: boolean
  photoError: string
  draft: DraftItem | null
  onBack: () => void
  onCopyCode: () => void
  onNewUpdate?: () => void
  onResumeDraft?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onRemoveItem?: (item: RemovableProjectItem) => Promise<string>
  onMap: () => void
  onBriefer: () => void
  generatingBriefer: boolean
  onLoadPhotos: () => void
  onGenerateAide?: (ref: string, source: 'online' | 'offline', date?: string) => void
}

const numberFormat = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })
const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
})

function label(value: unknown, fallback = 'Not recorded') {
  return String(value ?? '').trim() || fallback
}

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const raw = String(value).replaceAll(',', '').replace(/%$/, '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function percent(value: unknown) {
  const n = numeric(value)
  return n === null ? 'Not reported' : `${numberFormat.format(n)}%`
}

function currency(value: unknown) {
  const n = numeric(value)
  return n === null ? 'Not reported' : pesos.format(n)
}

function dateLabel(value: unknown) {
  const raw = label(value, '')
  if (!raw || /^(?:-|n\/?a)$/i.test(raw)) return 'Not recorded'
  const localDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const unzonedTimestamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
  const date = new Date(localDateOnly ? `${raw}T00:00:00+08:00`
    : unzonedTimestamp ? `${raw.replace(' ', 'T')}Z` : raw)
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : raw
}

function coordinateLabel(latitude: unknown, longitude: unknown, fallback: string) {
  const lat = numeric(latitude)
  const lon = numeric(longitude)
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fallback
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

function updateKind(update: DesktopProjectUpdate) {
  if (SITE_PREFIX.test(update.remarks || '')) return 'Site Update'
  if (OFFICE_PREFIX.test(update.remarks || '')) return 'Office Update'
  return 'Recorded Update'
}

function updateDate(update: DesktopProjectUpdate) {
  return update.inspection_date || update.created_at
}

function isPendingUpdate(update: DesktopProjectUpdate) {
  return (Boolean(update.local_id || update.is_offline) && update.synced !== true &&
    String(update.sync_status).toLowerCase() !== 'synced')
}

function isInspectionRecord(update: DesktopProjectUpdate) {
  return update.photo_retry_only !== true
}

function aideReference(update: DesktopProjectUpdate) {
  const source = update.is_offline || update.local_id ? 'offline' : 'online'
  return { source, ref: String(update.local_id || update.online_update_id || update.id || '') } as const
}

function updateSnapshot(update: DesktopProjectUpdate, records: Props['localAideRecords']) {
  const { ref, source } = aideReference(update)
  const snapshot = records.get(`${source}:${ref}`)
  return snapshot?.status === 'final' ? snapshot : undefined
}

function inspectionText(update: DesktopProjectUpdate, snapshot?: OfflineAideMemoire) {
  const remarks = (update.remarks || '').replace(UPDATE_PREFIX, '').trim()
  const timelines = [...remarks.matchAll(/^\s*Timeline \d+:\s*([^\r\n]+)/gim)].map((match) => match[1])
  const recordedTimelines = snapshot?.findings?.map((item) => item.timeline?.trim()).filter(Boolean)
  const values = recordedTimelines?.length ? recordedTimelines : timelines
  return {
    finding: label(update.issues, 'No findings recorded'),
    recommendation: label(update.recommendations, 'No recommendations recorded'),
    followUp: [...new Set(values.map((value) => value.trim()).filter(Boolean))]
      .map((value) => /^(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T.*)$/.test(value) ? dateLabel(value) : value),
    remarks: label(remarks, 'No remarks recorded'),
    gps: coordinateLabel(update.inspection_latitude, update.inspection_longitude, 'GPS not captured'),
  }
}

function varianceText(physical: unknown, target: unknown) {
  const actual = numeric(physical)
  const goal = numeric(target)
  if (actual === null || goal === null) return null
  const delta = Math.round((actual - goal) * 100) / 100
  if (!delta) return 'On target'
  return `${numberFormat.format(Math.abs(delta))} percentage ${Math.abs(delta) === 1 ? 'point' : 'points'} ${delta > 0 ? 'ahead' : 'behind'}`
}

function Panel({ eyebrow, title, action, children }: {
  eyebrow: string; title: string; action?: ReactNode; children?: ReactNode
}) {
  return <section className="pdd-card">
    <header className="pdd-panel-heading">
      <div><p className="pdd-kicker">{eyebrow}</p><h2>{title}</h2></div>
      {action}
    </header>
    {children}
  </section>
}

function Rows({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return <dl className="pdd-rows">
    {rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
  </dl>
}

type RequestRemoval = (item: RemovableProjectItem) => void

function RemoveItemButton({ item, onRequest }: { item: RemovableProjectItem; onRequest: RequestRemoval }) {
  return <button type="button" className="pdd-remove-item" aria-label={`Remove ${item.kind}: ${item.label}`}
    onClick={() => onRequest(item)}>Remove{item.kind === 'update' ? ' update' : ''}</button>
}

function FileRow({ item, onRequest }: { item: FileItem; onRequest?: RequestRemoval }) {
  const openButton = <button className="pdd-file-row" type="button" onClick={item.open}>
    <span className="pdd-file-type">{item.format}</span>
    <span className="pdd-file-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>
    <span className="pdd-link-text">Open <span aria-hidden="true">↗</span></span>
  </button>
  return item.removal && onRequest ? <div className="pdd-file-entry">
    {openButton}<RemoveItemButton item={item.removal} onRequest={onRequest} />
  </div> : openButton
}

function PhotoLink({ photo, compact = false, onRequest }: { photo: SupportingPhoto; compact?: boolean; onRequest?: RequestRemoval }) {
  if (!photo.photo_url) return null
  const link = <a className={compact ? 'pdd-linked-photo' : 'pdd-photo'} href={getDriveImageOpenUrl(photo.photo_url)} target="_blank" rel="noreferrer">
    {!compact && <img src={getDriveImagePreviewUrl(photo.photo_url, 480)} alt="" loading="lazy" decoding="async" />}
    <span><strong>{label(photo.caption, 'Inspection photo')}</strong><small>{dateLabel(photo.uploaded_at)}</small></span>
  </a>
  return onRequest ? <div className={compact ? 'pdd-linked-photo-entry' : 'pdd-photo-entry'}>
    {link}<RemoveItemButton item={{ kind: 'photo', id: String(photo.id), label: label(photo.caption, 'Inspection photo') }} onRequest={onRequest} />
  </div> : link
}

function InspectionPhotos({ projectId, updateId, photoRevision, onRequest }: {
  projectId: string; updateId: string; photoRevision: number; onRequest?: RequestRemoval
}) {
  const [result, setResult] = useState<{ photos: SupportingPhoto[]; error: boolean; more: boolean } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const { data, error } = await supabase.from('project_photos')
          .select('id, photo_url, caption, uploaded_at')
          .eq('project_id', projectId)
          .eq('project_update_id', updateId)
          .order('uploaded_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .limit(7)
          .abortSignal(controller.signal)
        if (error) throw error
        if (!controller.signal.aborted) setResult({ photos: (data || []).slice(0, 6), error: false, more: (data || []).length > 6 })
      } catch {
        if (!controller.signal.aborted) setResult({ photos: [], error: true, more: false })
      }
    })()
    return () => controller.abort()
  }, [projectId, updateId, photoRevision])

  if (!result) return <p className="pdd-quiet" role="status">Loading linked photos…</p>
  if (result.error) return <p className="pdd-quiet">Linked photos could not be loaded.</p>
  if (!result.photos.length) return <p className="pdd-quiet">No linked photos.</p>
  return <div className="pdd-linked-photos">
    {result.photos.map((photo) => <PhotoLink key={photo.id} photo={photo} compact onRequest={onRequest} />)}
    {result.more && <p className="pdd-quiet">More photos are available in Files &amp; Photos.</p>}
  </div>
}

function InspectionRow({ update, props, initiallyOpen, photoRevision, onRequest }: {
  update: DesktopProjectUpdate; props: Props; initiallyOpen: boolean; photoRevision: number; onRequest?: RequestRemoval
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const snapshot = updateSnapshot(update, props.localAideRecords)
  const notes = inspectionText(update, snapshot)
  const { ref, source } = aideReference(update)
  const cloudId = update.online_update_id || (source === 'online' ? String(update.id || '') : '')
  const followUp = notes.followUp.join(' · ')
  const updateRisk = numeric(update.physical_accomplishment) === 100
    ? 'No Risk'
    : /^(none|no risk)$/i.test(label(update.risk_level, '')) ? 'No Risk' : label(update.risk_level)
  return <details className="pdd-inspection" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
    <summary>
      <span className="pdd-inspection-date">{dateLabel(updateDate(update))}</span>
      <span className="pdd-inspection-meta">{updateKind(update)}{isPendingUpdate(update) ? ' · Pending sync' : ''}</span>
      <span className="pdd-inspection-values">Physical {percent(update.physical_accomplishment)} <span aria-hidden="true">·</span> Financial {percent(update.financial_accomplishment)}</span>
      <span className="pdd-inspection-chevron" aria-hidden="true">›</span>
    </summary>
    {isOpen && <div className="pdd-inspection-body">
      <Rows rows={[
        ['Finding', notes.finding],
        ['Recommendation', notes.recommendation],
        ...(followUp ? [['Follow-up', followUp] as const] : []),
        ['Remarks', notes.remarks],
        ['Inspection GPS', notes.gps],
        ['Risk at this update', updateRisk],
      ]} />
      {cloudId && !props.offline && <InspectionPhotos key={cloudId} projectId={props.projectId} updateId={cloudId} photoRevision={photoRevision} onRequest={onRequest} />}
      {props.onGenerateAide && ref && <button type="button" className="pdd-btn pdd-btn-secondary"
        onClick={() => props.onGenerateAide?.(ref, source, update.inspection_date || undefined)}>
        {snapshot ? 'Open Aide Memoire' : 'Generate Aide Memoire'}
      </button>}
      {source === 'online' && cloudId && onRequest && <RemoveItemButton onRequest={onRequest}
        item={{ kind: 'update', id: cloudId, label: `${updateKind(update)} · ${dateLabel(updateDate(update))}` }} />}
    </div>}
  </details>
}

export default function DesktopProjectDetails(props: Props) {
  const { project, projectId, updates: projectUpdates, offline } = props
  const updates = projectUpdates.filter(isInspectionRecord)
  const [section, setSection] = useState<Section>('overview')
  const [siteResult, setSiteResult] = useState<{ update: DesktopProjectUpdate | null; error: boolean } | null>(null)
  const [older, setOlder] = useState<DesktopProjectUpdate[]>([])
  const [historyHasMore, setHistoryHasMore] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [updateRevision, setUpdateRevision] = useState(0)
  const [photoRevision, setPhotoRevision] = useState(0)
  const [removal, setRemoval] = useState<RemovableProjectItem | null>(null)
  const [removalError, setRemovalError] = useState('')
  const [removalNotice, setRemovalNotice] = useState('')
  const [removing, setRemoving] = useState(false)
  const removalDialog = useRef<HTMLDialogElement>(null)
  const removalBusy = useRef(false)
  const canRemoveItems = Boolean(!offline && props.onRemoveItem)
  const historyRequest = useRef<AbortController | null>(null)
  const tabRefs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({})
  const domId = useId()
  const latest = updates[0]
  const currentSite = updates.find((update) => updateKind(update) === 'Site Update')
  const lookupSite = !offline && !currentSite && updates.length > 0
  const site = currentSite || (lookupSite ? siteResult?.update : null)
  const featured = site || latest
  const featuredKind = featured ? updateKind(featured) : null
  const notes = featured ? inspectionText(featured, updateSnapshot(featured, props.localAideRecords)) : null
  const linkedOfficialSource = props.projectCode ? 'SubayBAYAN' : 'Project Registry'
  const officialTarget = project.target_physical_accomplishment
  const siteTarget = site?.target_physical_accomplishment
  const latestFile = props.files[0]
  const hasContractExpiry = Boolean(label(project.revised_contract_expiration_date, '') || label(project.contract_expiration_date, ''))
  const contractExpiry = project.revised_contract_expiration_date || project.contract_expiration_date
  const isRevised = Boolean(label(project.revised_contract_expiration_date, ''))
  const catalog = [...new Map([...updates, ...older].map((update, index) =>
    [String(update.local_id || update.id || index), update])).values()]
    .sort((a, b) => String(updateDate(b) || '').localeCompare(String(updateDate(a) || ''))
      || String(b.created_at || '').localeCompare(String(a.created_at || '')))

  useEffect(() => {
    if (!lookupSite) return
    const controller = new AbortController()
    void (async () => {
      try {
        const { data, error } = await supabase.from('project_updates').select('*')
          .eq('project_id', projectId)
          .ilike('remarks', 'Update Type: Site Update%')
          .order('inspection_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1).abortSignal(controller.signal)
        if (error) throw error
        if (!controller.signal.aborted) setSiteResult({ update: (data?.[0] as DesktopProjectUpdate | undefined) ?? null, error: false })
      } catch {
        if (!controller.signal.aborted) setSiteResult({ update: null, error: true })
      }
    })()
    return () => controller.abort()
  }, [lookupSite, projectId, updateRevision])

  useEffect(() => () => historyRequest.current?.abort(), [])

  async function loadOlder() {
    if (offline || !historyHasMore || historyRequest.current) return
    const controller = new AbortController()
    historyRequest.current = controller
    setHistoryLoading(true)
    setHistoryError('')
    const start = projectUpdates.length + older.length
    try {
      const { data, error } = await supabase.from('project_updates').select('*')
        .eq('project_id', projectId)
        .order('inspection_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(start, start + HISTORY_PAGE_SIZE).abortSignal(controller.signal)
      if (error) throw error
      if (controller.signal.aborted) return
      const rows = (data || []) as DesktopProjectUpdate[]
      setOlder((previous) => [...previous, ...rows.slice(0, HISTORY_PAGE_SIZE)])
      setHistoryHasMore(rows.length > HISTORY_PAGE_SIZE)
    } catch {
      if (!controller.signal.aborted) setHistoryError('Could not load older updates. You can try again.')
    } finally {
      if (historyRequest.current === controller) {
        historyRequest.current = null
        if (!controller.signal.aborted) setHistoryLoading(false)
      }
    }
  }

  function requestRemoval(item: RemovableProjectItem) {
    if (!canRemoveItems || removalBusy.current) return
    setRemovalNotice('')
    setRemovalError('')
    setRemoval(item)
    removalDialog.current?.showModal()
  }

  async function confirmRemoval() {
    if (!removal || !canRemoveItems || !props.onRemoveItem || removalBusy.current) return
    removalBusy.current = true
    setRemoving(true)
    setRemovalError('')
    try {
      const notice = await props.onRemoveItem(removal)
      if (removal.kind === 'update') {
        historyRequest.current?.abort()
        historyRequest.current = null
        setOlder([])
        setHistoryLoading(false)
        setHistoryHasMore(true)
        setHistoryError('')
        setSiteResult(null)
        setUpdateRevision((value) => value + 1)
      } else if (removal.kind === 'photo') {
        setPhotoRevision((value) => value + 1)
      }
      setRemovalNotice(notice || `${removal.label} removed from PMS10.`)
      removalDialog.current?.close()
      tabRefs.current[section]?.focus()
    } catch (error) {
      setRemovalError(error instanceof Error ? error.message : 'Could not remove this item. Try again.')
    } finally {
      removalBusy.current = false
      setRemoving(false)
    }
  }

  function jump(next: Section) {
    setSection(next)
    tabRefs.current[next]?.focus()
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const next = step ? (index + step + TABS.length) % TABS.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    jump(TABS[next][0])
  }

  return <div className="pdd-workspace">
    <div className="pdd-breadcrumb">
      <button type="button" className="pdd-inline" onClick={props.onBack}><span aria-hidden="true">← </span>Back to Projects</button>
      <span aria-hidden="true">/</span><span>Project Details</span>
    </div>
    <header className="pdd-project-head">
      <div className="pdd-project-identity">
        <p className="pdd-project-meta"><strong>{props.program !== '-' ? props.program : 'Project'}</strong>{props.fundingYear !== '-' ? ` · ${props.fundingYear}` : ''}{label(project.project_type, '') ? ` · ${label(project.project_type)}` : ''}</p>
        <h1>{label(project.project_name, 'Untitled Project')}</h1>
        <p className="pdd-location">{props.location}</p>
        {props.projectCode && <div className="pdd-code"><span>{props.projectCode}</span><button type="button" className="pdd-inline" onClick={props.onCopyCode} aria-label="Copy SubayBAYAN project code">{props.copiedCode ? 'Copied' : 'Copy'}</button></div>}
      </div>
      <div className="pdd-project-controls">
        <div className="pdd-action-group">
          {props.onNewUpdate && <button type="button" className="pdd-btn pdd-btn-primary" onClick={props.draft ? props.onResumeDraft : props.onNewUpdate}>
            {props.draft ? 'Resume Draft' : 'New Update'}
          </button>}
          <details className="pdd-actions">
            <summary className="pdd-btn pdd-btn-secondary">More actions <span aria-hidden="true">▾</span></summary>
            <div className="pdd-actions-menu">
              <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onMap() }}>View GIS Map</button>
              <button type="button" disabled={props.generatingBriefer} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onBriefer() }}>
                {props.generatingBriefer ? 'Preparing Project Briefer…' : 'Generate Project Briefer'}
              </button>
              {props.onEdit && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onEdit?.() }}>Edit Project</button>}
              {props.onDelete && <button type="button" className="pdd-danger" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); props.onDelete?.() }}>Delete Project</button>}
            </div>
          </details>
        </div>
        <div className="pdd-statuses"><span className="pdd-tag pdd-tag-blue">{props.status}</span><span className="pdd-tag" data-risk={props.riskTone}>{props.riskLabel}</span></div>
        {props.draft && <p className="pdd-draft-note">Draft saved on this device{props.draft.updatedAt ? ` · ${dateLabel(props.draft.updatedAt)}` : ''}</p>}
      </div>
    </header>

    {removalNotice && <p className="pdd-removal-notice" role="status">{removalNotice}</p>}
    {canRemoveItems && <dialog ref={removalDialog} className="pdd-removal-dialog"
      aria-labelledby={`${domId}-remove-title`} aria-describedby={`${domId}-remove-explanation`}
      onClose={() => setRemoval(null)} onCancel={(event) => { if (removalBusy.current) event.preventDefault() }}>
      <h2 id={`${domId}-remove-title`}>Remove {removal?.kind || 'item'}?</h2>
      <p className="pdd-removal-label">{removal?.label}</p>
      <p id={`${domId}-remove-explanation`} className="pdd-quiet">{removal?.kind === 'update'
        ? 'This removes the update from inspection history. Its linked photos and documents stay in Files & Photos.'
        : 'This removes the file from PMS10. It does not delete the original file from storage.'}</p>
      {removalError && <p className="pdd-removal-error" role="alert">{removalError}</p>}
      <div className="pdd-removal-actions">
        <button type="button" autoFocus className="pdd-btn pdd-btn-secondary" disabled={removing} onClick={() => removalDialog.current?.close()}>Cancel</button>
        <button type="button" className="pdd-btn pdd-btn-destructive" disabled={removing || !removal}
          onClick={() => void confirmRemoval()}>{removing ? 'Removing…' : 'Remove from PMS10'}</button>
      </div>
    </dialog>}
    {offline && <p className="pdd-offline">Offline view. Project details are cached and updates shown here are from this device.</p>}
    <div className="pdd-tabs" role="tablist" aria-label="Project details sections">
      {TABS.map(([key, title], index) => <button type="button" key={key}
        role="tab" id={`${domId}-tab-${key}`} aria-controls={`${domId}-panel-${key}`}
        aria-selected={section === key} tabIndex={section === key ? 0 : -1}
        ref={(node) => { tabRefs.current[key] = node }}
        onClick={() => setSection(key)} onKeyDown={(event) => onTabKey(event, index)}>{title}</button>)}
    </div>

    {TABS.map(([key]) => <div key={key} role="tabpanel" hidden={section !== key} tabIndex={0}
      id={`${domId}-panel-${key}`} aria-labelledby={`${domId}-tab-${key}`} className="pdd-tabpanel">
      {section !== key ? null : key === 'overview' ? <>
        <div className="pdd-overview-grid">
          <Panel eyebrow={featuredKind === 'Site Update' ? 'Latest site inspection' : 'Latest project update'}
            title={featured ? dateLabel(updateDate(featured)) : 'No update recorded'}
            action={featuredKind && <span className="pdd-tag pdd-tag-blue">{featuredKind}</span>}>
            {notes ? <>
              {featured && isPendingUpdate(featured) && <p className="pdd-quiet">Saved on this device · pending sync</p>}
              <Rows rows={[
                ['Finding', notes.finding],
                ['Recommendation', notes.recommendation],
                ['Follow-up', notes.followUp.length ? notes.followUp.join(' · ') : 'No follow-up recorded'],
              ]} />
              <div className="pdd-panel-footer"><span className="pdd-quiet">{notes.gps}</span><button type="button" className="pdd-inline" onClick={() => jump('inspections')}>View inspection history <span aria-hidden="true">→</span></button></div>
              {site && latest && latest !== featured && <p className="pdd-quiet pdd-secondary-update">Latest recorded {updateKind(latest).toLowerCase()} · {dateLabel(updateDate(latest))}</p>}
              {lookupSite && !siteResult && <p className="pdd-quiet" role="status">Checking for an earlier site inspection…</p>}
              {lookupSite && siteResult?.error && <p className="pdd-quiet">Earlier site inspections could not be checked.</p>}
            </> : <p className="pdd-quiet">{offline ? 'No update is available on this device.' : 'No inspection or office update has been submitted yet.'}</p>}
          </Panel>
          <div className="pdd-stack">
            <Panel eyebrow="Contract at a glance" title={currency(numeric(project.budget) === null && !props.officialCost ? null : props.officialCost)}>
              <p className="pdd-quiet">{hasContractExpiry ? `${isRevised ? 'Revised expiry' : 'Contract expiry'} · ${dateLabel(contractExpiry)}` : 'Contract expiry not recorded'}</p>
              <button type="button" className="pdd-inline" onClick={() => jump('contract')}>View contract &amp; funding <span aria-hidden="true">→</span></button>
            </Panel>
            <Panel eyebrow="Latest Aide Memoire" title={latestFile ? dateLabel(latestFile.date) : 'No file available'}
              action={latestFile && <span className="pdd-tag">{latestFile.format}</span>}>
              {latestFile && <button type="button" className="pdd-inline" onClick={latestFile.open}>Open latest file <span aria-hidden="true">↗</span></button>}
              <button type="button" className="pdd-inline" onClick={() => jump('files')}>View files &amp; photos <span aria-hidden="true">→</span></button>
            </Panel>
          </div>
        </div>
        <Panel eyebrow="Accomplishment" title="Reported vs. observed">
          <table className="pdd-progress-table">
            <thead><tr><th scope="col">Progress</th><th scope="col">{linkedOfficialSource}</th><th scope="col">Actual On-Site</th></tr></thead>
            <tbody>
              <tr><th scope="row">Physical</th><td>{percent(project.physical_accomplishment)}</td><td>{site ? percent(site.physical_accomplishment) : 'No site update'}</td></tr>
              <tr><th scope="row">Financial</th><td>{percent(project.financial_accomplishment)}</td><td>{site ? percent(site.financial_accomplishment) : 'No site update'}</td></tr>
              <tr><th scope="row">Physical target</th><td>{percent(officialTarget)}</td><td>{site ? percent(siteTarget) : 'No site update'}</td></tr>
              <tr><th scope="row">Physical variance</th><td>{varianceText(project.physical_accomplishment, officialTarget) || 'Not available'}</td><td>{site ? varianceText(site.physical_accomplishment, siteTarget) || 'Not available' : 'No site update'}</td></tr>
              <tr><th scope="row">Source date</th><td>Not recorded</td><td>{site ? dateLabel(updateDate(site)) : 'No site update'}</td></tr>
            </tbody>
          </table>
          <p className="pdd-quiet">Actual On-Site uses the latest entry marked Site Update. Office updates are listed under Inspections.</p>
        </Panel>
      </> : key === 'contract' ? <>
        <div className="pdd-contract-grid">
          <Panel eyebrow="Contract" title="Implementation details"><Rows rows={[
            ['Implementing office', label(project.implementing_office)], ['Contractor', label(project.contractor)],
            ['Start date', dateLabel(project.start_date)], ['Target completion', dateLabel(project.target_completion_date)],
            ['Original expiry', dateLabel(project.contract_expiration_date)], ['Revised expiry', dateLabel(project.revised_contract_expiration_date)],
            ['Contract modification', label(project.contract_modification_type, 'None recorded')],
          ]} /></Panel>
          <Panel eyebrow="Funding" title="Financial record"><Rows rows={[
            ['Program', props.program === '-' ? 'Not recorded' : props.program],
            ['Funding year', props.fundingYear === '-' ? 'Not recorded' : props.fundingYear],
            ['Project budget', currency(project.budget)], ['Revised project cost', currency(project.revised_project_cost)],
            ['Official disbursement', currency(project.disbursement_amount)], ['Official reverted funds', currency(project.reverted_funds)],
            ['Authority to debit (NADAI)', dateLabel(project.nadai_date)],
            ...(numeric(project.nadai_amount) !== null ? [['NADAI amount', currency(project.nadai_amount)] as const] : []),
          ]} /></Panel>
        </div>
        <div className="pdd-contract-grid">
          <Panel eyebrow="Project profile" title="Scope of work"><p className="pdd-scope">{label(project.description, 'No project description recorded.')}</p></Panel>
          <Panel eyebrow="Location" title="Project site" action={<button type="button" className="pdd-inline" onClick={props.onMap}>GIS Map <span aria-hidden="true">↗</span></button>}>
            <Rows rows={[
              ['Site', props.location],
              ['Project coordinates', coordinateLabel(project.latitude, project.longitude, 'No site coordinates recorded')],
            ]} />
          </Panel>
        </div>
      </> : key === 'inspections' ? <Panel eyebrow="Project updates" title="Inspection history"
        action={<span className="pdd-tag">{catalog.length} shown</span>}>
        {catalog.length ? <div className="pdd-timeline">
          {catalog.map((update, index) => <InspectionRow key={String(update.id ?? update.local_id ?? index)} update={update} props={props} initiallyOpen={index === 0}
            photoRevision={photoRevision} onRequest={canRemoveItems ? requestRemoval : undefined} />)}
        </div> : <p className="pdd-quiet">No project updates available.</p>}
        {historyError && <p role="status" className="pdd-quiet">{historyError}</p>}
        {!offline && historyHasMore && projectUpdates.length >= 5 && <button type="button" className="pdd-btn pdd-btn-secondary" disabled={historyLoading} onClick={() => void loadOlder()}>
          {historyLoading ? 'Loading updates…' : 'Load older updates'}
        </button>}
      </Panel> : <div className="pdd-contract-grid pdd-files-grid">
        <Panel eyebrow="Documents" title="Aide Memoire Files" action={<span className="pdd-tag">{props.files.length} / {props.fileLimit} files</span>}>
          {props.files.length ? <div className="pdd-file-list">{props.files.map((item) => <FileRow key={item.id} item={item} onRequest={canRemoveItems ? requestRemoval : undefined} />)}</div>
            : <p className="pdd-quiet">{offline ? 'No Aide Memoire files saved on this device.' : 'No Aide Memoire files have been generated for this project yet.'}</p>}
          {props.draft && props.onResumeDraft && <button type="button" className="pdd-file-row pdd-draft-row" onClick={props.onResumeDraft}>
            <span className="pdd-file-type">Draft</span><span className="pdd-file-copy"><strong>Latest Update Draft</strong><small>Saved on this device{props.draft.inspectionDate ? ` · ${dateLabel(props.draft.inspectionDate)} update` : ''}</small></span><span className="pdd-link-text">Resume Draft</span>
          </button>}
        </Panel>
        <Panel eyebrow="Site evidence" title="Photo Gallery" action={!offline && <span className="pdd-tag">{props.photos.length}{props.photosHaveMore ? '+' : ''} {props.photos.length === 1 && !props.photosHaveMore ? 'photo' : 'photos'}</span>}>
          {offline ? <p className="pdd-quiet">The online gallery is unavailable offline. Check Offline Sync for photos pending upload.</p>
            : props.photos.length ? <div className="pdd-photo-grid">{props.photos.map((photo) => <PhotoLink key={photo.id} photo={photo} onRequest={canRemoveItems ? requestRemoval : undefined} />)}</div>
              : <p className="pdd-quiet">No photos uploaded yet.</p>}
          {props.photoError && <p className="pdd-quiet" role="status">{props.photoError}</p>}
          {!offline && props.photosHaveMore && <button className="pdd-btn pdd-btn-secondary" type="button" onClick={props.onLoadPhotos} disabled={props.photosLoading}>{props.photosLoading ? 'Loading photos…' : 'Load more photos'}</button>}
        </Panel>
      </div>}
    </div>)}
  </div>
}
