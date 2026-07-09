const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.mobile-navbar-blue-restore.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const markers = [
  'PMS10 MOBILE GLASS NAV BAR',
  'PMS10 MOBILE NAVBAR COMPACT FIX',
  'PMS10 MOBILE NAVBAR BLUE RESTORE',
]

// Remove previous mobile navbar experiment blocks.
for (const marker of markers) {
  let oldIndex = css.indexOf(marker)

  while (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)

    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)

    oldIndex = css.indexOf(marker)
  }
}

css += `
/* =========================
   PMS10 MOBILE NAVBAR BLUE RESTORE
   Mobile only. Restores solid banner-blue bottom nav.
========================= */

@media (max-width: 900px) {
  .app-mobile-nav {
    position: fixed !important;
    left: max(10px, env(safe-area-inset-left)) !important;
    right: max(10px, env(safe-area-inset-right)) !important;
    bottom: calc(10px + env(safe-area-inset-bottom)) !important;
    width: auto !important;
    max-width: 680px !important;
    margin: 0 auto !important;

    min-height: 68px !important;
    height: 68px !important;
    max-height: 68px !important;
    padding: 7px !important;

    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 24px !important;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.13), transparent 34%),
      linear-gradient(135deg, #123f73 0%, #18599d 56%, #2368b5 100%) !important;

    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;

    box-shadow:
      0 16px 34px rgba(15, 48, 87, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.18) !important;

    overflow: hidden !important;
    z-index: 1200 !important;
  }

  .app-mobile-nav::before,
  .app-mobile-nav::after {
    display: none !important;
    content: none !important;
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

    color: rgba(255, 255, 255, 0.82) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
  }

  .app-mobile-nav a.active,
  .app-mobile-nav-link.active,
  .app-mobile-nav .active {
    background: rgba(255, 255, 255, 0.18) !important;
    color: #ffffff !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 8px 18px rgba(15, 23, 42, 0.12) !important;
  }

  .app-mobile-nav svg {
    width: 21px !important;
    height: 21px !important;
    color: currentColor !important;
    fill: currentColor !important;
    stroke: currentColor !important;
    filter: none !important;
    margin-bottom: 2px !important;
  }

  .app-mobile-nav span,
  .app-mobile-nav-label {
    color: currentColor !important;
    font-size: 0.68rem !important;
    line-height: 1 !important;
    font-weight: 900 !important;
  }

  .app-main {
    padding-bottom: calc(94px + env(safe-area-inset-bottom)) !important;
  }
}

@media (max-width: 420px) {
  .app-mobile-nav {
    left: max(7px, env(safe-area-inset-left)) !important;
    right: max(7px, env(safe-area-inset-right)) !important;
    bottom: calc(8px + env(safe-area-inset-bottom)) !important;

    min-height: 64px !important;
    height: 64px !important;
    max-height: 64px !important;
    padding: 6px !important;
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

  .app-main {
    padding-bottom: calc(90px + env(safe-area-inset-bottom)) !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Mobile navbar restored to solid blue banner style.')
console.log('Removed previous glass/compact nav experiment CSS blocks.')
