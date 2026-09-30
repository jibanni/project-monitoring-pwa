import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import '../styles/multiSelectFilter.css'

type MultiSelectFilterProps = {
  label: string
  options: string[]
  values: string[]
  onChange: (values: string[]) => void
  allLabel: string
  formatOptionLabel?: (value: string) => string
  className?: string
}

type MenuPlacement = {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const VIEWPORT_GUTTER = 12
const MENU_GAP = 6
const DESKTOP_MENU_MIN_WIDTH = 280
const DESKTOP_MENU_MAX_WIDTH = 380

export default function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
  allLabel,
  formatOptionLabel = (value) => value,
  className = '',
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const normalizedOptions = useMemo(
    () =>
      Array.from(
        new Set(
          options
            .map((option) => String(option).trim())
            .filter(Boolean),
        ),
      ),
    [options],
  )

  const selectedSet = useMemo(() => new Set(values), [values])

  const buttonText = useMemo(() => {
    if (values.length === 0) return allLabel
    if (values.length === 1) return formatOptionLabel(values[0])
    if (values.length === 2) {
      return values.map(formatOptionLabel).join(', ')
    }
    return `${values.length} selected`
  }, [allLabel, formatOptionLabel, values])

  function updatePlacement() {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const isCompact = viewportWidth <= 700

    const desiredWidth = isCompact
      ? Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2)
      : Math.min(
          DESKTOP_MENU_MAX_WIDTH,
          Math.max(rect.width, DESKTOP_MENU_MIN_WIDTH),
        )

    const width = Math.min(
      desiredWidth,
      Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2),
    )

    let left = isCompact ? VIEWPORT_GUTTER : rect.left

    if (left + width > viewportWidth - VIEWPORT_GUTTER) {
      left = viewportWidth - VIEWPORT_GUTTER - width
    }

    left = Math.max(VIEWPORT_GUTTER, left)

    const availableBelow =
      viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_GUTTER
    const availableAbove =
      rect.top - MENU_GAP - VIEWPORT_GUTTER

    const openUpward =
      availableBelow < 260 && availableAbove > availableBelow

    if (openUpward) {
      setPlacement({
        left,
        width,
        bottom: viewportHeight - rect.top + MENU_GAP,
        maxHeight: Math.max(180, availableAbove),
      })
      return
    }

    setPlacement({
      left,
      width,
      top: rect.bottom + MENU_GAP,
      maxHeight: Math.max(180, availableBelow),
    })
  }

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }

    updatePlacement()
  }, [open])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node

      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }

      setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    function handleViewportChange() {
      updatePlacement()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown, {
      passive: true,
    })
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open])

  function toggleValue(value: string) {
    if (selectedSet.has(value)) {
      onChange(values.filter((item) => item !== value))
      return
    }

    onChange([...values, value])
  }

  const menu =
    open && placement
      ? createPortal(
          <div
            ref={menuRef}
            className="pms-multi-filter-menu pms-multi-filter-menu-portal"
            role="listbox"
            aria-label={`${label} options`}
            aria-multiselectable="true"
            style={{
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight,
            }}
          >
            <button
              type="button"
              className={`pms-multi-filter-option pms-multi-filter-all ${
                values.length === 0 ? 'is-selected' : ''
              }`}
              onClick={() => onChange([])}
              role="option"
              aria-selected={values.length === 0}
            >
              <span
                className="pms-multi-filter-check"
                aria-hidden="true"
              >
                {values.length === 0 ? '✓' : ''}
              </span>
              <span className="pms-multi-filter-option-text">
                {allLabel}
              </span>
            </button>

            <div className="pms-multi-filter-options">
              {normalizedOptions.map((option) => {
                const selected = selectedSet.has(option)

                return (
                  <button
                    type="button"
                    key={option}
                    className={`pms-multi-filter-option ${
                      selected ? 'is-selected' : ''
                    }`}
                    onClick={() => toggleValue(option)}
                    role="option"
                    aria-selected={selected}
                  >
                    <span
                      className="pms-multi-filter-check"
                      aria-hidden="true"
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="pms-multi-filter-option-text">
                      {formatOptionLabel(option)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="pms-multi-filter-footer">
              <span>
                {values.length === 0
                  ? 'All included'
                  : `${values.length} selected`}
              </span>
              <button type="button" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div
        ref={rootRef}
        className={`pms-multi-filter ${
          open ? 'is-open' : ''
        } ${className}`.trim()}
      >
        <span className="pms-multi-filter-label">{label}</span>

        <button
          ref={triggerRef}
          type="button"
          className="pms-multi-filter-trigger"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="pms-multi-filter-trigger-text">
            {buttonText}
          </span>
          <span
            className="pms-multi-filter-chevron"
            aria-hidden="true"
          />
        </button>
      </div>

      {menu}
    </>
  )
}
