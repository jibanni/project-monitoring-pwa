import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../styles/actionMenu.css'

export type ActionMenuTone = 'primary' | 'document' | 'accent' | 'neutral' | 'danger'

export type ActionMenuItem = {
  id: string
  label: string
  icon: ReactNode
  onSelect: () => void
  tone?: ActionMenuTone
  disabled?: boolean
  hidden?: boolean
  title?: string
}

type ActionMenuProps = {
  items: ActionMenuItem[]
  ariaLabel?: string
  launcherLabel?: string
  className?: string
}

function LauncherIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" />
      ) : (
        <path d="M12 5v14M5 12h14" />
      )}
    </svg>
  )
}

export default function ActionMenu({
  items,
  ariaLabel = 'Page actions',
  launcherLabel = 'Open actions',
  className = '',
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const viewportHeightBaselineRef = useRef(0)
  const visibleItems = items.filter((item) => !item.hidden)

  useEffect(() => {
    const visualViewport = window.visualViewport
    if (!visualViewport) return

    const isEditableElement = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false
      if (element.isContentEditable) return true
      return element.matches('input, textarea, select, [role="textbox"]')
    }

    viewportHeightBaselineRef.current = Math.max(
      viewportHeightBaselineRef.current,
      visualViewport.height,
    )

    const updateKeyboardState = () => {
      const editing = isEditableElement(document.activeElement)

      if (!editing) {
        viewportHeightBaselineRef.current = Math.max(
          viewportHeightBaselineRef.current,
          visualViewport.height,
        )
        setKeyboardOpen(false)
        return
      }

      const heightLoss = Math.max(
        0,
        viewportHeightBaselineRef.current - visualViewport.height,
      )

      setKeyboardOpen(heightLoss >= 120)
    }

    const handleFocusOut = () => {
      window.setTimeout(updateKeyboardState, 100)
    }

    updateKeyboardState()
    visualViewport.addEventListener('resize', updateKeyboardState)
    window.addEventListener('focusin', updateKeyboardState)
    window.addEventListener('focusout', handleFocusOut)
    window.addEventListener('orientationchange', updateKeyboardState)

    return () => {
      visualViewport.removeEventListener('resize', updateKeyboardState)
      window.removeEventListener('focusin', updateKeyboardState)
      window.removeEventListener('focusout', handleFocusOut)
      window.removeEventListener('orientationchange', updateKeyboardState)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const closeWhenOutside = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false)
      }
    }

    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeWhenOutside)
    window.addEventListener('keydown', closeWithEscape)

    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  if (visibleItems.length === 0) return null

  const content = (
    <>
      {open && (
        <button
          type="button"
          className="pms-action-menu-scrim"
          aria-label="Close actions"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        ref={rootRef}
        className={`pms-action-menu ${open ? 'is-open' : 'is-closed'} ${keyboardOpen ? 'is-keyboard-open' : ''} ${className}`.trim()}
      >
      {open && (
        <div className="pms-action-menu-panel" role="menu" aria-label={ariaLabel}>
          {visibleItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`pms-action-menu-item tone-${item.tone || 'primary'}`}
              style={{ '--pms-action-index': index } as CSSProperties}
              onClick={() => {
                if (item.disabled) return
                setOpen(false)
                item.onSelect()
              }}
              disabled={item.disabled}
              title={item.title || item.label}
              role="menuitem"
            >
              <span className="pms-action-menu-item-label">{item.label}</span>
              <span className="pms-action-menu-item-icon" aria-hidden="true">
                {item.icon}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="pms-action-menu-launcher"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? 'Close actions' : launcherLabel}
        title={open ? 'Close actions' : launcherLabel}
      >
        <LauncherIcon open={open} />
        </button>
      </div>
    </>
  )

  return createPortal(content, document.body)
}
