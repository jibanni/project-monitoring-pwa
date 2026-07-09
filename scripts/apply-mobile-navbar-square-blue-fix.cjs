const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.mobile-navbar-square-blue.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const markers = [
  'PMS10 MOBILE GLASS NAV BAR',
  'PMS10 MOBILE NAVBAR COMPACT FIX',
  'PMS10 MOBILE NAVBAR BLUE RESTORE',
  'PMS10 MOBILE NAVBAR SQUARE BLUE FIX',
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
   PMS10 MOBILE NAVBAR SQUARE BLUE FIX
   Mobile only. Full-width rectangular blue bottom bar, no floating frame.
========================= */

@media (max-width: 900px) {
  .app-mobile-nav {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    max-width: none !important;
    height: calc(64px + env(safe-area-inset-bottom)) !important;
    min-height: calc(64px + env(safe-area-inset-bottom)) !important;
    max-height: calc(64px + env(safe-area-inset-bottom)) !important;
    margin: 0 !important;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom)) !important;

    border: 0 !important;
    border-radius: 0 !important;
    outline: 0 !important;

    background:
      linear-gradient(135deg, #123f73 0%, #18599d 56%, #2368b5 100%) !important;

    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;

    box-shadow:
      0 -10px 26px rgba(15, 48, 87, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;

    overflow: hidden !important;
    z-index: 1200 !important;
  }

  .app-mobile-nav::before,
  .app-mobile-nav::after {
    display: none !important;
    content: none !important;
    background: transparent !important;
    box-shadow: none !important;
    border: 0 !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link {
    position: relative !important;
    z-index: 1 !important;

    flex: 1 1 0 !important;
    min-width: 0 !important;
    min-height: 52px !important;
    height: 52px !important;
    max-height: 52px !important;

    margin: 0 !important;
    padding: 5px 2px !important;
    border: 0 !important;
    border-radius: 0 !important;
    outline: 0 !important;

    color: rgba(255, 255, 255, 0.78) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
  }

  .app-mobile-nav a.active,
  .app-mobile-nav-link.active,
  .app-mobile-nav .active {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.12) !important;
    border-radius: 12px !important;
    box-shadow: none !important;
  }

  .app-mobile-nav svg,
  .app-mobile-nav a svg,
  .app-mobile-nav button svg,
  .app-mobile-nav-link svg {
    width: 21px !important;
    height: 21px !important;
    color: currentColor !important;
    fill: currentColor !important;
    stroke: currentColor !important;
    filter: none !important;
    margin: 0 0 2px !important;
  }

  .app-mobile-nav span,
  .app-mobile-nav-label,
  .app-mobile-nav a span,
  .app-mobile-nav button span {
    color: currentColor !important;
    font-size: 0.64rem !important;
    line-height: 1 !important;
    font-weight: 900 !important;
  }

  .app-main {
    padding-bottom: calc(82px + env(safe-area-inset-bottom)) !important;
  }
}

@media (max-width: 420px) {
  .app-mobile-nav {
    height: calc(62px + env(safe-area-inset-bottom)) !important;
    min-height: calc(62px + env(safe-area-inset-bottom)) !important;
    max-height: calc(62px + env(safe-area-inset-bottom)) !important;
    padding: 5px 6px calc(5px + env(safe-area-inset-bottom)) !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link {
    min-height: 52px !important;
    height: 52px !important;
    max-height: 52px !important;
  }

  .app-mobile-nav svg {
    width: 20px !important;
    height: 20px !important;
  }

  .app-mobile-nav span,
  .app-mobile-nav-label,
  .app-mobile-nav a span,
  .app-mobile-nav button span {
    font-size: 0.62rem !important;
  }

  .app-main {
    padding-bottom: calc(80px + env(safe-area-inset-bottom)) !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Mobile navbar fixed to square full-width blue bar.')
console.log('Removed prior glass/rounded mobile navbar experiment CSS blocks.')
