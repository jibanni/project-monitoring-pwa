const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.mobile-navbar-vertical-center.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const marker = 'PMS10 MOBILE NAVBAR VERTICAL CENTER FIX'

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
   PMS10 MOBILE NAVBAR VERTICAL CENTER FIX
   Mobile only. Centers icon + label inside the blue bottom bar.
========================= */

@media (max-width: 900px) {
  .app-mobile-nav {
    display: flex !important;
    align-items: center !important;
    justify-content: space-around !important;
    padding-top: 4px !important;
    padding-bottom: calc(4px + env(safe-area-inset-bottom)) !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link,
  .app-mobile-nav [role='button'],
  .app-mobile-nav [role='tab'] {
    height: 52px !important;
    min-height: 52px !important;
    max-height: 52px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 4px !important;
    padding: 3px 2px !important;
    line-height: 1 !important;
  }

  .app-mobile-nav svg,
  .app-mobile-nav a svg,
  .app-mobile-nav button svg,
  .app-mobile-nav-link svg {
    display: block !important;
    margin: 0 !important;
    transform: translateY(0) !important;
  }

  .app-mobile-nav span,
  .app-mobile-nav-label,
  .app-mobile-nav a span,
  .app-mobile-nav button span {
    display: block !important;
    margin: 0 !important;
    line-height: 1 !important;
    transform: translateY(0) !important;
  }

  .app-mobile-nav a.active,
  .app-mobile-nav-link.active,
  .app-mobile-nav .active,
  .app-mobile-nav a[aria-current='page'],
  .app-mobile-nav [aria-current='page'] {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
}

@media (max-width: 420px) {
  .app-mobile-nav {
    padding-top: 4px !important;
    padding-bottom: calc(4px + env(safe-area-inset-bottom)) !important;
  }

  .app-mobile-nav a,
  .app-mobile-nav button,
  .app-mobile-nav-link,
  .app-mobile-nav [role='button'],
  .app-mobile-nav [role='tab'] {
    height: 50px !important;
    min-height: 50px !important;
    max-height: 50px !important;
    gap: 4px !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Mobile navbar icon/label vertical center fix applied.')
