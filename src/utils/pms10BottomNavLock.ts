const NAV_LABELS = ['home', 'projects', 'map', 'reports', 'sync', 'users']

function textOf(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isBottomNavCandidate(element: Element) {
  const text = textOf(element)
  return NAV_LABELS.every((label) => text.includes(label))
}

function findBottomNavs() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.app-mobile-nav, .pms10-bottom-nav-v17-rect-strip, [class*="bottom-nav"], nav',
    ),
  )

  return candidates.filter(isBottomNavCandidate)
}

function getNavItems(nav: HTMLElement) {
  return Array.from(nav.querySelectorAll<HTMLElement>('a, button')).filter((item) => {
    const text = textOf(item)
    return NAV_LABELS.some((label) => text === label || text.includes(label))
  })
}

function setStyle(element: HTMLElement, properties: Record<string, string>) {
  Object.entries(properties).forEach(([key, value]) => {
    element.style.setProperty(key, value, 'important')
  })
}

function lockOneNav(nav: HTMLElement) {
  const totalHeight = 'calc(72px + env(safe-area-inset-bottom, 0px))'
  const visualHeight = '72px'
  const itemWidth = '62px'
  const itemHeight = '50px'
  const iconSize = '20px'

  setStyle(nav, {
    height: totalHeight,
    'min-height': totalHeight,
    'max-height': totalHeight,
    'padding-top': '4px',
    'padding-bottom': 'env(safe-area-inset-bottom, 0px)',
    'box-sizing': 'border-box',
    overflow: 'hidden',
    transform: 'none',
    translate: 'none',
    animation: 'none',
  })

  Array.from(nav.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return

    setStyle(child, {
      height: visualHeight,
      'min-height': visualHeight,
      'max-height': visualHeight,
      width: '100%',
      display: 'grid',
      'grid-template-columns': 'repeat(6, minmax(0, 1fr))',
      'align-items': 'center',
      'justify-items': 'center',
      gap: '0',
      transform: 'none',
      translate: 'none',
      animation: 'none',
    })
  })

  getNavItems(nav).forEach((item) => {
    setStyle(item, {
      width: itemWidth,
      'min-width': itemWidth,
      'max-width': itemWidth,
      height: itemHeight,
      'min-height': itemHeight,
      'max-height': itemHeight,
      padding: '5px 4px 4px',
      margin: '0',
      'border-radius': '18px',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      'justify-self': 'center',
      'align-self': 'center',
      gap: '2px',
      'box-sizing': 'border-box',
      flex: `0 0 ${itemWidth}`,
      transform: 'none',
      translate: 'none',
      animation: 'none',
      'will-change': 'auto',
    })

    item.querySelectorAll<HTMLElement>('svg, img').forEach((icon) => {
      setStyle(icon, {
        width: iconSize,
        'min-width': iconSize,
        'max-width': iconSize,
        height: iconSize,
        'min-height': iconSize,
        'max-height': iconSize,
        transform: 'none',
        translate: 'none',
        animation: 'none',
      })
    })

    item.querySelectorAll<HTMLElement>('span, small').forEach((label) => {
      setStyle(label, {
        'font-size': '0.72rem',
        'line-height': '1',
        'letter-spacing': '0',
        'text-align': 'center',
        'white-space': 'nowrap',
        overflow: 'hidden',
        'text-overflow': 'clip',
        transform: 'none',
        translate: 'none',
        animation: 'none',
      })
    })
  })
}

function lockBottomNav() {
  if (typeof document === 'undefined') return
  findBottomNavs().forEach(lockOneNav)
}

let rafId = 0

function scheduleLock() {
  if (rafId) return
  rafId = window.requestAnimationFrame(() => {
    rafId = 0
    lockBottomNav()
  })
}

export function initPms10BottomNavLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  lockBottomNav()

  const observer = new MutationObserver(scheduleLock)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-current'],
  })

  window.addEventListener('scroll', scheduleLock, { passive: true })
  window.addEventListener('resize', scheduleLock, { passive: true })
  window.addEventListener('orientationchange', scheduleLock, { passive: true })

  document.addEventListener('pointerdown', scheduleLock, { capture: true, passive: true })
  document.addEventListener('pointerup', scheduleLock, { capture: true, passive: true })
  document.addEventListener('click', scheduleLock, { capture: true, passive: true })
  document.addEventListener('focusin', scheduleLock, { capture: true })

  window.setTimeout(lockBottomNav, 100)
  window.setTimeout(lockBottomNav, 300)
  window.setTimeout(lockBottomNav, 800)
  window.setInterval(lockBottomNav, 1500)
}
