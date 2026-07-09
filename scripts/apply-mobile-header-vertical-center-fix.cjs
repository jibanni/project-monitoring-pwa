const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

const backupPath = `${layoutCssPath}.mobile-header-vertical-center.bak`
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(layoutCssPath, backupPath)
  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

const marker = 'PMS10 MOBILE HEADER VERTICAL CENTER FIX'

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
   PMS10 MOBILE HEADER VERTICAL CENTER FIX
   Mobile only. Centers the top main banner/header contents vertically.
========================= */

@media (max-width: 900px) {
  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-height: 112px !important;
    padding-top: max(10px, env(safe-area-inset-top)) !important;
    padding-bottom: 10px !important;
  }

  .app-header-inner {
    width: 100% !important;
    min-height: 72px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
  }

  .app-brand {
    min-height: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo {
    flex: 0 0 auto !important;
    align-self: center !important;
  }

  .app-brand-text {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    min-height: 52px !important;
  }

  .app-user-area {
    min-height: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    align-self: center !important;
    gap: 8px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  .app-user-avatar {
    align-self: center !important;
    flex: 0 0 auto !important;
  }

  .app-user-text {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    min-height: 44px !important;
  }

  .app-user-name,
  .app-user-role {
    line-height: 1.05 !important;
  }

  .app-logout-button,
  .app-user-logout-inline {
    align-self: center !important;
  }
}

@media (max-width: 420px) {
  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header {
    min-height: 108px !important;
    padding-top: max(8px, env(safe-area-inset-top)) !important;
    padding-bottom: 8px !important;
  }

  .app-header-inner {
    min-height: 70px !important;
  }

  .app-brand-text {
    min-height: 48px !important;
  }

  .app-user-text {
    min-height: 42px !important;
  }
}
`

fs.writeFileSync(layoutCssPath, css)

console.log('Mobile header vertical center fix applied.')
