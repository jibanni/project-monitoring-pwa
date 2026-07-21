export function initPms10StandalonePwaClass() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari Home Screen PWA fallback
    ('standalone' in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))

  const apply = () => {
    document.body.classList.toggle('pms10-standalone-pwa', Boolean(isStandalone))
  }

  if (document.body) {
    apply()
  } else {
    document.addEventListener('DOMContentLoaded', apply, { once: true })
  }
}
