const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutCssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

let css = fs.readFileSync(layoutCssPath, 'utf8')

// Remove previous final force block if rerun.
const marker = 'PMS10 FORCE DESKTOP TOPBAR HOTFIX'
let idx = css.indexOf(marker)
while (idx >= 0) {
  const start = css.lastIndexOf('/*', idx)
  const safeStart = start >= 0 ? start : idx
  const next = css.indexOf('/* =========================', idx + marker.length)
  css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  idx = css.indexOf(marker)
}

const forceCss = `
/* =========================
   PMS10 FORCE DESKTOP TOPBAR HOTFIX
   Final desktop-only override. Mobile stays untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --pms10-desktop-header-h: 76px !important;
    --pms10-page-x: 24px !important;
    --pms10-page-y: 18px !important;
  }

  .app-shell,
  .app-shell.app-scrolled,
  .app-shell.app-sidebar-collapsed {
    padding-top: var(--pms10-desktop-header-h) !important;
    padding-left: 0 !important;
    padding-bottom: 0 !important;
    background: #f3f7fb !important;
    --current-header-h: var(--pms10-desktop-header-h) !important;
    --app-header-live-h: var(--pms10-desktop-header-h) !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-header.app-sidebar-collapsed,
  .app-scrolled .app-header,
  .app-shell .app-header,
  .app-shell.app-sidebar-collapsed .app-header,
  body > .app-header {
    position: fixed !important;
    z-index: 1000 !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: auto !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    height: var(--pms10-desktop-header-h) !important;
    min-height: var(--pms10-desktop-header-h) !important;
    max-height: var(--pms10-desktop-header-h) !important;
    margin: 0 !important;
    padding: 10px var(--pms10-page-x) !important;
    border-radius: 0 !important;
    border: 0 !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22) !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96)) !important;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08) !important;
    color: #0f172a !important;
    overflow: visible !important;
    transform: none !important;
  }

  .app-header-inner,
  .app-header.app-sidebar-collapsed .app-header-inner,
  .app-shell.app-sidebar-collapsed .app-header .app-header-inner {
    width: min(1540px, 100%) !important;
    max-width: min(1540px, 100%) !important;
    height: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(250px, 340px) minmax(0, 1fr) auto !important;
    align-items: center !important;
    justify-content: initial !important;
    gap: 18px !important;
    overflow: visible !important;
  }

  .app-brand,
  .app-header.app-sidebar-collapsed .app-brand,
  .app-shell.app-sidebar-collapsed .app-header .app-brand {
    width: auto !important;
    min-height: 0 !important;
    height: auto !important;
    padding: 0 !important;
    border: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    color: #0f172a !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo,
  .app-header.app-sidebar-collapsed .app-brand-logo-wrap,
  .app-header.app-sidebar-collapsed .app-brand-logo,
  .app-shell.app-sidebar-collapsed .app-header .app-brand-logo-wrap,
  .app-shell.app-sidebar-collapsed .app-header .app-brand-logo {
    display: block !important;
    width: 46px !important;
    height: 46px !important;
    flex: 0 0 auto !important;
    border-radius: 999px !important;
  }

  .app-brand-text,
  .app-header.app-sidebar-collapsed .app-brand-text,
  .app-shell.app-sidebar-collapsed .app-header .app-brand-text {
    display: block !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }

  .app-brand-title {
    color: #0f172a !important;
    font-size: 1rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.055em !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  .app-brand-subtitle {
    margin-top: 3px !important;
    color: #1e3a5f !important;
    font-size: 0.62rem !important;
    font-weight: 900 !important;
    letter-spacing: 0.055em !important;
    white-space: nowrap !important;
    line-height: 1 !important;
  }

  .app-brand-unit,
  .app-scrolled .app-brand-unit {
    display: block !important;
    max-height: none !important;
    margin-top: 4px !important;
    color: #64748b !important;
    font-size: 0.64rem !important;
    font-weight: 700 !important;
    opacity: 1 !important;
    white-space: nowrap !important;
    line-height: 1 !important;
  }

  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }

  .app-desktop-nav,
  .app-header.app-sidebar-collapsed .app-desktop-nav,
  .app-shell.app-sidebar-collapsed .app-header .app-desktop-nav {
    width: auto !important;
    max-width: 100% !important;
    min-height: 0 !important;
    height: auto !important;
    flex: unset !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  .app-nav-link,
  .app-header.app-sidebar-collapsed .app-nav-link,
  .app-shell.app-sidebar-collapsed .app-header .app-nav-link {
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 42px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    border-radius: 999px !important;
    padding: 0 13px !important;
    color: #334155 !important;
    background: transparent !important;
    font-size: 0.84rem !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
    white-space: nowrap !important;
    box-shadow: none !important;
    transform: none !important;
  }

  .app-nav-link:hover {
    background: #eff6ff !important;
    color: #0f4c81 !important;
  }

  .app-nav-link.active {
    background: linear-gradient(135deg, #0f4c81, #145da0) !important;
    color: #ffffff !important;
    box-shadow: 0 10px 22px rgba(20, 93, 160, 0.22) !important;
  }

  .app-nav-label,
  .app-header.app-sidebar-collapsed .app-nav-label,
  .app-shell.app-sidebar-collapsed .app-header .app-nav-label {
    display: inline !important;
    min-width: 0 !important;
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: nowrap !important;
  }

  .app-nav-icon,
  .app-nav-icon svg {
    width: 18px !important;
    height: 18px !important;
    flex: 0 0 auto !important;
  }

  .app-user-area,
  .app-header.app-sidebar-collapsed .app-user-area,
  .app-shell.app-sidebar-collapsed .app-header .app-user-area {
    width: auto !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    display: grid !important;
    grid-template-columns: 42px minmax(120px, auto) auto !important;
    align-items: center !important;
    justify-content: initial !important;
    gap: 10px !important;
  }

  .app-user-avatar,
  .app-header.app-sidebar-collapsed .app-user-avatar,
  .app-shell.app-sidebar-collapsed .app-header .app-user-avatar {
    display: grid !important;
    width: 42px !important;
    height: 42px !important;
    background: #e0f2fe !important;
    color: #0f4c81 !important;
    border: 1px solid rgba(20, 93, 160, 0.18) !important;
  }

  .app-user-text,
  .app-header.app-sidebar-collapsed .app-user-text,
  .app-shell.app-sidebar-collapsed .app-header .app-user-text {
    display: block !important;
  }

  .app-user-name {
    max-width: 190px !important;
    color: #0f172a !important;
    font-size: 0.82rem !important;
    line-height: 1.1 !important;
  }

  .app-user-role {
    margin-top: 2px !important;
    color: #64748b !important;
    font-size: 0.62rem !important;
  }

  .app-logout-button,
  .app-header.app-sidebar-collapsed .app-logout-button,
  .app-shell.app-sidebar-collapsed .app-header .app-logout-button {
    display: inline-flex !important;
    width: auto !important;
    min-width: 84px !important;
    min-height: 38px !important;
    margin: 0 !important;
    border-radius: 999px !important;
    background: #ef4444 !important;
    color: #ffffff !important;
    font-size: 0.74rem !important;
    box-shadow: 0 10px 22px rgba(239, 68, 68, 0.16) !important;
  }

  .app-main {
    width: min(1540px, 100%) !important;
    margin: 0 auto !important;
    padding: 18px 24px 34px !important;
  }

  .app-mobile-nav {
    display: none !important;
  }
}

@media (min-width: 901px) and (max-width: 1180px) {
  .app-header-inner,
  .app-header.app-sidebar-collapsed .app-header-inner,
  .app-shell.app-sidebar-collapsed .app-header .app-header-inner {
    grid-template-columns: minmax(210px, 290px) minmax(0, 1fr) auto !important;
    gap: 10px !important;
  }

  .app-user-text {
    display: none !important;
  }

  .app-user-area,
  .app-header.app-sidebar-collapsed .app-user-area,
  .app-shell.app-sidebar-collapsed .app-header .app-user-area {
    grid-template-columns: 40px auto !important;
  }
}

@media (max-width: 900px) {
  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }
}
`

css += forceCss
fs.writeFileSync(layoutCssPath, css)

console.log('Force desktop topbar hotfix applied.')
console.log('Tip: clear localStorage key pms10-desktop-sidebar-collapsed in browser if needed, but this CSS should override it.')
