import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import '../styles/advisoryTicker.css'

type AdvisoryRecord = {
  id: string
  message: string
  link_url: string | null
  open_in_new_tab: boolean
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  priority: number
  created_at: string
}

function isCurrentlyVisible(item: AdvisoryRecord, now = Date.now()) {
  if (!item.is_active) return false

  const start = item.starts_at ? new Date(item.starts_at).getTime() : null
  const end = item.ends_at ? new Date(item.ends_at).getTime() : null

  if (start !== null && Number.isFinite(start) && start > now) return false
  if (end !== null && Number.isFinite(end) && end <= now) return false

  return true
}

export default function AdvisoryTicker() {
  const [records, setRecords] = useState<AdvisoryRecord[]>([])
  const [clock, setClock] = useState(Date.now())

  /*
   * repeatCount is calculated from the actual banner width.
   * This is what removes the long blank spaces on wide screens.
   */
  const [repeatCount, setRepeatCount] = useState(2)
  const [unitWidth, setUnitWidth] = useState(0)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const unitRef = useRef<HTMLDivElement | null>(null)

  const loadAdvisories = useCallback(async () => {
    const { data, error } = await supabase
      .from('advisories')
      .select(
        'id,message,link_url,open_in_new_tab,is_active,starts_at,ends_at,priority,created_at',
      )
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Unable to load PMS10 advisories.', error)
      return
    }

    setRecords((data || []) as AdvisoryRecord[])
  }, [])

  useEffect(() => {
    void loadAdvisories()

    const channel = supabase
      .channel('pms10-advisory-banner')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'advisories' },
        () => void loadAdvisories(),
      )
      .subscribe()

    const refreshTimer = window.setInterval(() => {
      setClock(Date.now())
    }, 30_000)

    const handleFocus = () => {
      setClock(Date.now())
      void loadAdvisories()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', handleFocus)
      void supabase.removeChannel(channel)
    }
  }, [loadAdvisories])

  const visible = useMemo(
    () => records.filter((item) => isCurrentlyVisible(item, clock)),
    [records, clock],
  )

  const visibleSignature = useMemo(
    () =>
      visible
        .map(
          (item) =>
            `${item.id}|${item.message}|${item.link_url || ''}|${
              item.open_in_new_tab ? '1' : '0'
            }`,
        )
        .join('||'),
    [visible],
  )

  useEffect(() => {
    document.body.classList.toggle('pms10-has-advisories', visible.length > 0)

    return () => {
      document.body.classList.remove('pms10-has-advisories')
    }
  }, [visible.length])

  /*
   * Keep enough identical advisory groups in the track to cover the viewport
   * at all times. The animation moves by exactly ONE group width and loops.
   * Because the next group is identical, there is no visible stop/jump/gap.
   */
  useLayoutEffect(() => {
    if (visible.length === 0) return

    const calculate = () => {
      const viewport = viewportRef.current
      const unit = unitRef.current

      if (!viewport || !unit) return

      const viewportWidth = viewport.getBoundingClientRect().width
      const measuredUnitWidth = unit.getBoundingClientRect().width

      if (!viewportWidth || !measuredUnitWidth) return

      const requiredRepeats = Math.max(
        2,
        Math.ceil(viewportWidth / measuredUnitWidth) + 2,
      )

      setRepeatCount((current) =>
        current === requiredRepeats ? current : requiredRepeats,
      )

      setUnitWidth((current) =>
        Math.abs(current - measuredUnitWidth) < 1
          ? current
          : measuredUnitWidth,
      )
    }

    calculate()

    const observer = new ResizeObserver(calculate)

    if (viewportRef.current) observer.observe(viewportRef.current)
    if (unitRef.current) observer.observe(unitRef.current)

    window.addEventListener('resize', calculate)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', calculate)
    }
  }, [visible.length, visibleSignature])

  if (visible.length === 0) return null

  /*
   * About 62 px/second gives a readable but continuously moving ticker.
   * The duration changes with the advisory-group width so movement speed
   * remains consistent even when messages are added or removed.
   */
  const duration = unitWidth > 0 ? Math.max(8, unitWidth / 62) : 18

  const trackStyle = {
    '--pms10-advisory-shift': `${unitWidth}px`,
    '--pms10-advisory-duration': `${duration}s`,
  } as CSSProperties

  return (
    <section
      className="pms10-advisory-ticker"
      role="region"
      aria-label="PMS10 advisories"
    >
      <div className="pms10-advisory-label">
        <span className="pms10-advisory-label-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            className="pms10-advisory-label-svg"
            focusable="false"
            aria-hidden="true"
          >
            <path
              d="M4 10.5v3a2 2 0 0 0 2 2h2.2l1.1 4.1a1 1 0 0 0 1 .7h1.1a1 1 0 0 0 1-1.2l-.9-3.6H13l6.2 3.1a.8.8 0 0 0 1.2-.7V6.1a.8.8 0 0 0-1.2-.7L13 8.5H6a2 2 0 0 0-2 2Z"
              fill="currentColor"
            />
            <path
              d="M20.4 9.1c1 .3 1.6 1.2 1.6 2.4s-.6 2.1-1.6 2.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="pms10-advisory-label-text">System Advisory</span>
      </div>

      <div ref={viewportRef} className="pms10-advisory-viewport">
        <div className="pms10-advisory-track" style={trackStyle}>
          {Array.from({ length: repeatCount }).map((_, copyIndex) => (
            <div
              ref={copyIndex === 0 ? unitRef : undefined}
              key={`advisory-copy-${copyIndex}`}
              className="pms10-advisory-group"
              aria-hidden={copyIndex === 0 ? undefined : true}
            >
              {visible.map((item) =>
                item.link_url ? (
                  <a
                    key={`${copyIndex}-${item.id}`}
                    className="pms10-advisory-item is-linked"
                    href={item.link_url}
                    target={item.open_in_new_tab ? '_blank' : undefined}
                    rel={
                      item.open_in_new_tab
                        ? 'noopener noreferrer'
                        : undefined
                    }
                    tabIndex={copyIndex === 0 ? undefined : -1}
                    title={`Open advisory link: ${item.message}`}
                  >
                    <span className="pms10-advisory-dot" aria-hidden="true" />
                    <span className="pms10-advisory-message">
                      {item.message}
                    </span>
                    <span className="pms10-advisory-link-icon" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                ) : (
                  <span
                    key={`${copyIndex}-${item.id}`}
                    className="pms10-advisory-item"
                  >
                    <span className="pms10-advisory-dot" aria-hidden="true" />
                    <span className="pms10-advisory-message">
                      {item.message}
                    </span>
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
