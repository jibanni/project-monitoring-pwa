const MAP_ZOOM_ALLOWED_SELECTOR = [
  '.leaflet-container',
  '.pm-leaflet-map',
  '.pm-map-shell .leaflet-container',
  '.pm-map-shell',
].join(',')

const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0'])

function isElementTarget(target: EventTarget | null): target is Element {
  return target instanceof Element
}

function isInsideMap(target: EventTarget | null) {
  if (!isElementTarget(target)) return false
  return Boolean(target.closest(MAP_ZOOM_ALLOWED_SELECTOR))
}

function isEditableTarget(target: EventTarget | null) {
  if (!isElementTarget(target)) return false

  const element = target.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
  )

  return Boolean(element)
}

function preventOutsideMap(event: Event) {
  if (isInsideMap(event.target)) return
  event.preventDefault()
}

function preventCtrlWheelOutsideMap(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  if (isInsideMap(event.target)) return

  event.preventDefault()
}

function preventKeyboardZoom(event: KeyboardEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  if (!ZOOM_KEYS.has(event.key)) return
  if (isInsideMap(event.target)) return

  event.preventDefault()
}

let lastTouchEnd = 0

function preventDoubleTapZoomOutsideMap(event: TouchEvent) {
  if (isInsideMap(event.target)) return
  if (isEditableTarget(event.target)) return

  const now = Date.now()

  if (now - lastTouchEnd <= 340) {
    event.preventDefault()
  }

  lastTouchEnd = now
}

function preventMultiTouchOutsideMap(event: TouchEvent) {
  if (event.touches.length < 2) return
  if (isInsideMap(event.target)) return

  event.preventDefault()
}

function ensureViewportZoomLock() {
  const content = [
    'width=device-width',
    'initial-scale=1',
    'maximum-scale=1',
    'minimum-scale=1',
    'user-scalable=no',
    'viewport-fit=cover',
  ].join(', ')

  let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')

  if (!viewport) {
    viewport = document.createElement('meta')
    viewport.name = 'viewport'
    document.head.appendChild(viewport)
  }

  if (viewport.content !== content) {
    viewport.content = content
  }
}

export function initPms10DisableZoomExceptMap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  ensureViewportZoomLock()

  /*
    iOS Safari / installed iOS PWA gesture events.
    Keep map gesture zoom available by allowing events inside Leaflet/map shell.
  */
  document.addEventListener('gesturestart', preventOutsideMap, {
    passive: false,
    capture: true,
  })
  document.addEventListener('gesturechange', preventOutsideMap, {
    passive: false,
    capture: true,
  })
  document.addEventListener('gestureend', preventOutsideMap, {
    passive: false,
    capture: true,
  })

  /*
    Android Chrome / desktop trackpad pinch. Ctrl-wheel is browser zoom.
  */
  document.addEventListener('wheel', preventCtrlWheelOutsideMap, {
    passive: false,
    capture: true,
  })

  /*
    Touch pinch and double-tap zoom outside the map.
  */
  document.addEventListener('touchmove', preventMultiTouchOutsideMap, {
    passive: false,
    capture: true,
  })
  document.addEventListener('touchend', preventDoubleTapZoomOutsideMap, {
    passive: false,
    capture: true,
  })

  /*
    Desktop browser zoom shortcuts during testing.
  */
  document.addEventListener('keydown', preventKeyboardZoom, {
    passive: false,
    capture: true,
  })

  /*
    Some mobile browsers restore/alter viewport after orientation changes.
  */
  window.addEventListener('orientationchange', ensureViewportZoomLock, {
    passive: true,
  })
  window.addEventListener('resize', ensureViewportZoomLock, {
    passive: true,
  })

  window.setTimeout(ensureViewportZoomLock, 250)
  window.setTimeout(ensureViewportZoomLock, 900)
}
