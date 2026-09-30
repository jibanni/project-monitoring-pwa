import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import '../styles/singleSelectFilter.css'

export type SingleSelectOption = {
  value: string
  label: string
}

type SingleSelectFilterProps = {
  label: string
  value: string
  options: SingleSelectOption[]
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
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

export default function SingleSelectFilter({
  label,
  value,
  options,
  onChange,
  className = '',
  ariaLabel,
}: SingleSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const normalizedOptions = useMemo(() => {
    const seen = new Set<string>()

    return options.filter((option) => {
      const key = String(option.value)

      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [options])

  const selected =
    normalizedOptions.find((option) => option.value === value) ||
    normalizedOptions[0] ||
    null

  function updatePlacement() {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const compact = viewportWidth <= 700

    const desiredWidth = compact
      ? Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2)
      : Math.min(
          DESKTOP_MENU_MAX_WIDTH,
          Math.max(rect.width, DESKTOP_MENU_MIN_WIDTH),
        )

    const width = Math.min(
      desiredWidth,
      Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2),
    )

    let left = compact ? VIEWPORT_GUTTER : rect.left

    if (left + width > viewportWidth - VIEWPORT_GUTTER) {
      left = viewportWidth - VIEWPORT_GUTTER - width
    }

    left = Math.max(VIEWPORT_GUTTER, left)

    const below =
      viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_GUTTER
    const above =
      rect.top - MENU_GAP - VIEWPORT_GUTTER
    const openUpward = below < 230 && above > below

    if (openUpward) {
      setPlacement({
        left,
        width,
        bottom: viewportHeight - rect.top + MENU_GAP,
        maxHeight: Math.max(160, above),
      })
      return
    }

    setPlacement({
      left,
      width,
      top: rect.bottom + MENU_GAP,
      maxHeight: Math.max(160, below),
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

    function handleOutside(event: MouseEvent | TouchEvent) {
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

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, {
      passive: true,
    })
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open])

  function choose(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  const menu =
    open && placement
      ? createPortal(
          <div
            ref={menuRef}
            className="pms-single-filter-menu"
            role="listbox"
            aria-label={ariaLabel || `${label} options`}
            style={{
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight,
            }}
          >
            <div className="pms-single-filter-options">
              {normalizedOptions.map((option) => {
                const isSelected = option.value === value

                return (
                  <button
                    type="button"
                    key={`${option.value}:${option.label}`}
                    className={`pms-single-filter-option ${
                      isSelected ? 'is-selected' : ''
                    }`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(option.value)}
                  >
                    <span
                      className="pms-single-filter-check"
                      aria-hidden="true"
                    >
                      {isSelected ? '✓' : ''}
                    </span>
                    <span className="pms-single-filter-option-text">
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div
        ref={rootRef}
        className={`pms-single-filter ${
          open ? 'is-open' : ''
        } ${className}`.trim()}
      >
        <span className="pms-single-filter-label">{label}</span>

        <button
          ref={triggerRef}
          type="button"
          className="pms-single-filter-trigger"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel || label}
        >
          <span className="pms-single-filter-trigger-text">
            {selected?.label || ''}
          </span>
          <span
            className="pms-single-filter-chevron"
            aria-hidden="true"
          />
        </button>
      </div>

      {menu}
    </>
  )
}
