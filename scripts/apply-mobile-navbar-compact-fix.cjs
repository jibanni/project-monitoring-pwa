const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.mobile-navbar-compact.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const marker = 'PMS10 MOBILE NAVBAR COMPACT FIX'

// Remove old copy if rerun.
const oldIndex = css.indexOf(marker)
if (oldIndex >= 0) {
  const start = css.lastIndexOf('/*', oldIndex)
  const safeStart = start >= 0 ? start : oldIndex
  const next = css.indexOf('/* =========================', oldIndex + marker.length)
  css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
}

css += `
/* =========================
   PMS10 MOBILE NAVBAR COMPACT FIX
   Mobile only. Makes bottom nav slimmer, cleaner, and less intrusive.
========================= */

@media (max-width: 900px) {
  .app-mobile-nav {
    position: fixed !important;
    left: max(10px, env(safe-area-inset-left)) !important;
    right: max(10px, env(safe-area-inset-right)) !important;
    bottom: calc(10px + env(safe-area-inset-bottom)) !important;
    width: auto !important;
    max-width: 680px !important;
    height: 66px !important;
    min-height: 66px !important;
    max-height: 66px !important;
    margin: 0 auto !important;
    padding: 6px !important;
    border-radius: 24px !important;
    border: 1px solid rgba(255, 255, 255, 0.58) !important;
    background: rgba(255, 255, 255, 0.76) !important;
    -webkit-backdrop-filter: blur(18px) saturate(170%) !important;
    backdrop-filter: blur(18px) saturate(170%) !important;
    box-shadow:
      0 14px 34px rgba(15, 23, 42, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.74) !important;
    overflow: hidden !important;
    z-index: 1200 !important;
  }

  .app-mobile-nav::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    border-radius: inherit !important;
    pointer-events: none !important;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.38),
      rgba(255, 255, 255, 0.08)
    ) !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link {
    position: relative !important;
    z-index: 1 !important;
    min-height: 54px !important;
    height: 54px !important;
    max-height: 54px !important;
    border-radius: 18px !important;
    padding: 5px 4px !important;
    transform: none !important;
  }

  .app-mobile-nav a.active,
  .app-mobile-nav-link.active,
  .app-mobile-nav .active {
    background: rgba(255, 107, 44, 0.11) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.74),
      0 8px 18px rgba(255, 107, 44, 0.10) !important;
  }

  .app-mobile-nav svg {
    width: 21px !important;
    height: 21px !important;
    margin-bottom: 2px !important;
    filter: none !important;
  }

  .app-mobile-nav span,
  .app-mobile-nav-label {
    font-size: 0.68rem !important;
    line-height: 1 !important;
    font-weight: 850 !important;
  }

  .app-main {
    padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important;
  }
}

@media (max-width: 420px) {
  .app-mobile-nav {
    left: max(7px, env(safe-area-inset-left)) !important;
    right: max(7px, env(safe-area-inset-right)) !important;
    bottom: calc(8px + env(safe-area-inset-bottom)) !important;
    height: 62px !important;
    min-height: 62px !important;
    max-height: 62px !important;
    padding: 5px !important;
    border-radius: 22px !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link {
    min-height: 52px !important;
    height: 52px !important;
    max-height: 52px !important;
    border-radius: 16px !important;
  }

  .app-mobile-nav svg {
    width: 20px !important;
    height: 20px !important;
  }

  .app-mobile-nav span,
  .app-mobile-nav-label {
    font-size: 0.64rem !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Mobile navbar compact fix applied.')
console.log('Note: browser bottom address bar is controlled by Chrome/Safari; installed PWA/APK will look cleaner.')
