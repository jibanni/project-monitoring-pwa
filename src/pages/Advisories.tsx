import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import '../styles/advisories.css'

type Advisory = {
  id: string
  message: string
  link_url: string | null
  open_in_new_tab: boolean
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  priority: number
  created_by: string | null
  created_at: string
  updated_at: string
}

type FormState = {
  message: string
  linkUrl: string
  openInNewTab: boolean
  startsAt: string
  endsAt: string
  priority: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  message: '',
  linkUrl: '',
  openInNewTab: true,
  startsAt: '',
  endsAt: '',
  priority: '0',
  isActive: true,
}

function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formatDateTime(value: string | null) {
  if (!value) return 'No limit'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isAllowedLink(value: string) {
  if (!value) return true
  if (/^https?:\/\//i.test(value)) return true
  return value.startsWith('/') && !value.startsWith('//')
}

function getStatus(item: Advisory) {
  if (!item.is_active) return { label: 'Inactive', tone: 'muted' }

  const now = Date.now()
  const start = item.starts_at ? new Date(item.starts_at).getTime() : null
  const end = item.ends_at ? new Date(item.ends_at).getTime() : null

  if (start !== null && Number.isFinite(start) && start > now) {
    return { label: 'Scheduled', tone: 'scheduled' }
  }

  if (end !== null && Number.isFinite(end) && end <= now) {
    return { label: 'Ended', tone: 'ended' }
  }

  return { label: 'Live', tone: 'live' }
}

export default function Advisories() {
  const auth = useAuth() as any
  const [items, setItems] = useState<Advisory[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('advisories')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (loadError) {
      setError(loadError.message)
    } else {
      setError('')
      setItems((data || []) as Advisory[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()

    const channel = supabase
      .channel('pms10-advisory-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'advisories' },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const liveCount = useMemo(
    () => items.filter((item) => getStatus(item).label === 'Live').length,
    [items],
  )

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const startEdit = (item: Advisory) => {
    setEditingId(item.id)
    setForm({
      message: item.message,
      linkUrl: item.link_url || '',
      openInNewTab: item.open_in_new_tab ?? true,
      startsAt: toLocalInput(item.starts_at),
      endsAt: toLocalInput(item.ends_at),
      priority: String(item.priority ?? 0),
      isActive: item.is_active,
    })
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    const message = form.message.trim()
    const linkUrl = form.linkUrl.trim()

    if (!message) {
      setError('Enter an advisory message.')
      return
    }

    if (message.length > 500) {
      setError('Advisory message must not exceed 500 characters.')
      return
    }

    if (linkUrl.length > 2048) {
      setError('Advisory link is too long.')
      return
    }

    if (!isAllowedLink(linkUrl)) {
      setError(
        'Use a complete http:// or https:// link, or an internal PMS10 path beginning with /.',
      )
      return
    }

    const startsAt = toIso(form.startsAt)
    const endsAt = toIso(form.endsAt)

    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError('End date/time must be later than the start date/time.')
      return
    }

    const priority = Math.min(100, Math.max(0, Number(form.priority) || 0))

    setSaving(true)
    setError('')
    setNotice('')

    const payload = {
      message,
      link_url: linkUrl || null,
      open_in_new_tab: linkUrl ? form.openInNewTab : false,
      is_active: form.isActive,
      starts_at: startsAt,
      ends_at: endsAt,
      priority,
      created_by: auth?.user?.id || null,
    }

    const result = editingId
      ? await supabase
          .from('advisories')
          .update({
            message: payload.message,
            link_url: payload.link_url,
            open_in_new_tab: payload.open_in_new_tab,
            is_active: payload.is_active,
            starts_at: payload.starts_at,
            ends_at: payload.ends_at,
            priority: payload.priority,
          })
          .eq('id', editingId)
      : await supabase.from('advisories').insert(payload)

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setNotice(editingId ? 'Advisory updated.' : 'Advisory published.')
    resetForm()
    await load()
  }

  const toggleActive = async (item: Advisory) => {
    const { error: updateError } = await supabase
      .from('advisories')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setNotice(item.is_active ? 'Advisory deactivated.' : 'Advisory activated.')
    await load()
  }

  const remove = async (item: Advisory) => {
    if (!window.confirm('Permanently delete this advisory?')) return

    const { error: deleteError } = await supabase
      .from('advisories')
      .delete()
      .eq('id', item.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    if (editingId === item.id) resetForm()
    setNotice('Advisory deleted.')
    await load()
  }

  return (
    <main className="advisories-page">
      <section className="advisories-intro">
        <div>
          <span className="advisories-eyebrow">SYSTEM COMMUNICATIONS</span>
          <h1>Advisories</h1>
          <p>
            Post PMS10 banner announcements. Add an optional link when users
            should be able to click the advisory.
          </p>
        </div>

        <div className="advisories-live-summary">
          <strong>{liveCount}</strong>
          <span>Live now</span>
        </div>
      </section>

      <section className="advisory-editor-card">
        <div className="advisory-card-heading">
          <div>
            <span>{editingId ? 'EDIT ADVISORY' : 'NEW ADVISORY'}</span>
            <h2>{editingId ? 'Update advisory' : 'Post an advisory'}</h2>
          </div>
          {editingId ? (
            <button
              type="button"
              className="advisory-quiet-btn"
              onClick={resetForm}
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        {notice ? <div className="advisory-message success">{notice}</div> : null}
        {error ? <div className="advisory-message error">{error}</div> : null}

        <label className="advisory-field advisory-field-wide">
          <span>Message</span>
          <textarea
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                message: event.target.value,
              }))
            }
            maxLength={500}
            rows={3}
            placeholder="Type the advisory that PMS10 users should see..."
          />
          <small>{form.message.length}/500 characters</small>
        </label>

        <div className="advisory-link-panel">
          <label className="advisory-field advisory-field-wide">
            <span>Destination link (optional)</span>
            <input
              type="text"
              inputMode="url"
              value={form.linkUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  linkUrl: event.target.value,
                }))
              }
              placeholder="https://example.com/... or /reports"
            />
            <small>
              Leave blank for a text-only advisory. Linked advisories are
              clickable in the moving banner.
            </small>
          </label>

          <label
            className={`advisory-switch-field advisory-link-switch ${
              form.linkUrl.trim() ? '' : 'is-disabled'
            }`}
          >
            <span className="advisory-switch-copy">
              <strong>Open in new tab</strong>
              <small>
                Recommended for external websites, documents, and Google Drive links.
              </small>
            </span>
            <input
              type="checkbox"
              checked={form.openInNewTab}
              disabled={!form.linkUrl.trim()}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  openInNewTab: event.target.checked,
                }))
              }
            />
          </label>
        </div>

        <div className="advisory-form-grid">
          <label className="advisory-field">
            <span>Start date/time</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  startsAt: event.target.value,
                }))
              }
            />
            <small>Leave blank to show immediately.</small>
          </label>

          <label className="advisory-field">
            <span>End date/time</span>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  endsAt: event.target.value,
                }))
              }
            />
            <small>Leave blank to keep showing until deactivated.</small>
          </label>

          <label className="advisory-field">
            <span>Priority</span>
            <input
              type="number"
              min="0"
              max="100"
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value,
                }))
              }
            />
            <small>Higher priority appears earlier in the ticker.</small>
          </label>

          <label className="advisory-switch-field">
            <span className="advisory-switch-copy">
              <strong>Active</strong>
              <small>
                Allow this advisory to appear when its schedule is valid.
              </small>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
            />
          </label>
        </div>

        <div
          className={`advisory-preview ${
            form.linkUrl.trim() ? 'is-linked' : ''
          }`}
        >
          <span className="advisory-preview-label">ADVISORY</span>
          <span className="advisory-preview-text">
            {form.message.trim() || 'Your advisory preview will appear here.'}
            {form.linkUrl.trim() ? (
              <span className="advisory-preview-link-icon" aria-hidden="true">
                ↗
              </span>
            ) : null}
          </span>
        </div>

        <div className="advisory-editor-actions">
          <button
            type="button"
            className="advisory-secondary-btn"
            onClick={resetForm}
            disabled={saving}
          >
            Clear
          </button>
          <button
            type="button"
            className="advisory-primary-btn"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Post advisory'}
          </button>
        </div>
      </section>

      <section className="advisory-list-card">
        <div className="advisory-card-heading">
          <div>
            <span>MANAGE</span>
            <h2>Posted advisories</h2>
          </div>
          <span className="advisory-record-count">{items.length} total</span>
        </div>

        {loading ? (
          <div className="advisory-empty-state">Loading advisories…</div>
        ) : items.length === 0 ? (
          <div className="advisory-empty-state">
            No advisories have been posted yet.
          </div>
        ) : (
          <div className="advisory-records">
            {items.map((item) => {
              const status = getStatus(item)
              return (
                <article key={item.id} className="advisory-record">
                  <div className="advisory-record-main">
                    <div className="advisory-record-topline">
                      <span className={`advisory-status ${status.tone}`}>
                        {status.label}
                      </span>
                      <span>Priority {item.priority}</span>
                      {item.link_url ? (
                        <span className="advisory-linked-badge">Linked</span>
                      ) : null}
                    </div>

                    <p>{item.message}</p>

                    {item.link_url ? (
                      <div className="advisory-record-link">
                        <span>Destination:</span>
                        <a
                          href={item.link_url}
                          target={item.open_in_new_tab ? '_blank' : undefined}
                          rel={
                            item.open_in_new_tab
                              ? 'noopener noreferrer'
                              : undefined
                          }
                        >
                          {item.link_url}
                          <span aria-hidden="true"> ↗</span>
                        </a>
                      </div>
                    ) : null}

                    <div className="advisory-record-meta">
                      <span>Starts: {formatDateTime(item.starts_at)}</span>
                      <span>Ends: {formatDateTime(item.ends_at)}</span>
                    </div>
                  </div>

                  <div className="advisory-record-actions">
                    <button type="button" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleActive(item)}
                    >
                      {item.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void remove(item)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
