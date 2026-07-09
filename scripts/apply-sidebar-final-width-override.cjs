const fs = require('fs')
const path = require('path')

const cssPath = path.join(process.cwd(), 'src/styles/layout.css')
const layoutPath = path.join(process.cwd(), 'src/components/Layout.tsx')

if (!fs.existsSync(cssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

let css = fs.readFileSync(cssPath, 'utf8')

// Remove older sidebar overrides that were causing the header/sidebar to become full-screen.
function stripBlock(source, marker) {
  let next = source
  let index = next.indexOf(marker)

  while (index >= 0) {
    const commentStart = next.lastIndexOf('/*', index)
    const blockStart = commentStart >= 0 ? commentStart : index
    const nextBlock = next.indexOf('/* =========================', index + marker.length)

    if (nextBlock >= 0) {
      next = next.slice(0, blockStart) + next.slice(nextBlock)
    } else {
      next = next.slice(0, blockStart)
    }

    index = next.indexOf(marker)
  }

  return next
}

css = stripBlock(css, 'PMS10 DESKTOP SIDEBAR NAVIGATION')
css = stripBlock(css, 'PMS10 COLLAPSIBLE DESKTOP SIDEBAR')
css = stripBlock(css, 'PMS10 POLISHED DESKTOP SIDEBAR')
css = stripBlock(css, 'PMS10 SIDEBAR FINAL WIDTH OVERRIDE')

const finalCss = `
/* =========================
   PMS10 SIDEBAR FINAL WIDTH OVERRIDE
   ChatGPT-style desktop sidebar. Mobile layout remains untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --pms10-sidebar-open: 248px;
    --pms10-sidebar-closed: 74px;
    --pms10-sidebar-gap: 14px;
    --pms10-content-pad: 22px;
  }

  body {
    overflow-x: hidden !important;
  }

  .app-shell,
  .app-shell.app-scrolled {
    position: relative !important;
    width: 100% !important;
    min-height: 100vh !important;
    padding-top: 0 !important;
    padding-left: var(--pms10-sidebar-open) !important;
    padding-bottom: 0 !important;
    --current-header-h: 0px !important;
    transition: padding-left 180ms ease !important;
  }

  .app-shell.app-sidebar-collapsed {
    padding-left: var(--pms10-sidebar-closed) !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header,
  .app-shell .app-header,
  body > .app-header {
    position: fixed !important;
    z-index: 1000 !important;
    top: var(--pms10-sidebar-gap) !important;
    left: var(--pms10-sidebar-gap) !important;
    right: auto !important;
    bottom: var(--pms10-sidebar-gap) !important;
    width: calc(var(--pms10-sidebar-open) - (var(--pms10-sidebar-gap) * 2)) !important;
    min-width: calc(var(--pms10-sidebar-open) - (var(--pms10-sidebar-gap) * 2)) !important;
    max-width: calc(var(--pms10-sidebar-open) - (var(--pms10-sidebar-gap) * 2)) !important;
    height: calc(100dvh - (var(--pms10-sidebar-gap) * 2)) !important;
    min-height: 0 !important;
    max-height: calc(100dvh - (var(--pms10-sidebar-gap) * 2)) !important;
    margin: 0 !important;
    padding: 12px !important;
    border-radius: 22px !important;
    overflow: hidden !important;
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.14), transparent 34%),
      linear-gradient(180deg, #07305f 0%, #0f4c86 58%, #1d6bc0 100%) !important;
    box-shadow: 12px 0 32px rgba(15, 23, 42, 0.16) !important;
    transform: none !important;
    transition:
      width 180ms ease,
      min-width 180ms ease,
      max-width 180ms ease,
      padding 180ms ease !important;
  }

  .app-header.app-sidebar-collapsed,
  .app-shell.app-sidebar-collapsed .app-header {
    width: calc(var(--pms10-sidebar-closed) - (var(--pms10-sidebar-gap) * 2)) !important;
    min-width: calc(var(--pms10-sidebar-closed) - (var(--pms10-sidebar-gap) * 2)) !important;
    max-width: calc(var(--pms10-sidebar-closed) - (var(--pms10-sidebar-gap) * 2)) !important;
    padding: 9px 7px !important;
  }

  .app-header-inner {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    overflow: hidden !important;
  }

  .app-brand {
    width: 100% !important;
    min-height: 58px !important;
    padding: 3px 2px 10px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.14) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 9px !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo,
  .app-scrolled .app-brand-logo-wrap,
  .app-scrolled .app-brand-logo {
    width: 42px !important;
    height: 42px !important;
    flex: 0 0 auto !important;
  }

  .app-brand-text {
    display: block !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }

  .app-brand-title {
    font-size: 0.82rem !important;
    letter-spacing: 0.04em !important;
    line-height: 1.05 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .app-brand-subtitle {
    margin-top: 3px !important;
    font-size: 0.5rem !important;
    letter-spacing: 0.04em !important;
    white-space: normal !important;
    line-height: 1.08 !important;
    opacity: 0.9 !important;
  }

  .app-brand-unit,
  .app-scrolled .app-brand-unit {
    display: block !important;
    max-height: none !important;
    margin-top: 4px !important;
    font-size: 0.54rem !important;
    opacity: 0.74 !important;
    white-space: normal !important;
    line-height: 1.12 !important;
  }

  .app-sidebar-toggle {
    width: 38px !important;
    height: 36px !important;
    min-height: 36px !important;
    flex: 0 0 auto !important;
    display: grid !important;
    place-items: center !important;
    align-self: flex-end !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 13px !important;
    padding: 0 !important;
    cursor: pointer !important;
    background: rgba(255, 255, 255, 0.12) !important;
    color: #ffffff !important;
    box-shadow: none !important;
  }

  .app-sidebar-toggle:hover {
    background: rgba(255, 255, 255, 0.2) !important;
  }

  .app-sidebar-toggle svg {
    width: 19px !important;
    height: 19px !important;
    fill: currentColor !important;
  }

  .app-desktop-nav {
    width: 100% !important;
    max-width: 100% !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 6px !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 2px 0 6px !important;
    scrollbar-width: none !important;
  }

  .app-desktop-nav::-webkit-scrollbar {
    display: none !important;
  }

  .app-nav-link {
    width: 100% !important;
    min-height: 40px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    border-radius: 14px !important;
    padding: 9px 10px !important;
    color: rgba(255, 255, 255, 0.86) !important;
    font-size: 0.76rem !important;
    font-weight: 900 !important;
    letter-spacing: 0.005em !important;
    overflow: hidden !important;
    white-space: nowrap !important;
  }

  .app-nav-link:hover {
    background: rgba(255, 255, 255, 0.13) !important;
    color: #ffffff !important;
    transform: none !important;
  }

  .app-nav-link.active {
    background: #ffffff !important;
    color: var(--app-blue-800) !important;
    box-shadow: 0 12px 22px rgba(15, 23, 42, 0.18) !important;
  }

  .app-nav-icon,
  .app-nav-icon svg {
    width: 18px !important;
    height: 18px !important;
    flex: 0 0 auto !important;
  }

  .app-nav-label {
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .app-user-area {
    width: 100% !important;
    flex: 0 0 auto !important;
    margin-top: 6px !important;
    padding: 10px 2px 0 !important;
    border-top: 1px solid rgba(255, 255, 255, 0.14) !important;
    display: grid !important;
    grid-template-columns: 38px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 8px !important;
  }

  .app-user-avatar {
    width: 38px !important;
    height: 38px !important;
  }

  .app-user-name {
    max-width: 100% !important;
    font-size: 0.68rem !important;
    line-height: 1.1 !important;
  }

  .app-user-role {
    margin-top: 2px !important;
    font-size: 0.54rem !important;
  }

  .app-logout-button {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-height: 34px !important;
    margin-top: 8px !important;
    border-radius: 13px !important;
    font-size: 0.68rem !important;
  }

  .app-user-logout-inline {
    display: none !important;
  }

  .app-sidebar-trademark {
    width: 100% !important;
    flex: 0 0 auto !important;
    margin-top: 8px !important;
    padding: 7px 6px !important;
    border-radius: 13px !important;
    background: rgba(255, 255, 255, 0.09) !important;
    color: rgba(255, 255, 255, 0.82) !important;
    text-align: center !important;
    line-height: 1.14 !important;
  }

  .app-sidebar-trademark span,
  .app-sidebar-trademark small {
    display: block !important;
    color: rgba(255, 255, 255, 0.68) !important;
    font-size: 0.44rem !important;
    font-weight: 850 !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
  }

  .app-sidebar-trademark strong {
    display: block !important;
    margin: 2px 0 !important;
    color: #ffffff !important;
    font-size: 0.58rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.04em !important;
    text-transform: uppercase !important;
  }

  .app-main {
    width: min(1580px, 100%) !important;
    margin: 0 auto !important;
    padding: 18px var(--pms10-content-pad) 34px !important;
  }

  .dashboard-page,
  .projects-page,
  .pm-map-page,
  .reports-page,
  .offline-sync-page,
  .user-management-page,
  .create-project-page,
  .edit-project-page,
  .project-details-page,
  .pu-page {
    margin-top: 0 !important;
  }

  .app-mobile-nav {
    display: none !important;
  }

  .app-header.app-sidebar-collapsed .app-brand,
  .app-shell.app-sidebar-collapsed .app-header .app-brand {
    justify-content: center !important;
    min-height: 50px !important;
    padding: 2px 0 8px !important;
  }

  .app-header.app-sidebar-collapsed .app-brand-text,
  .app-shell.app-sidebar-collapsed .app-header .app-brand-text,
  .app-header.app-sidebar-collapsed .app-nav-label,
  .app-shell.app-sidebar-collapsed .app-header .app-nav-label,
  .app-header.app-sidebar-collapsed .app-user-text,
  .app-shell.app-sidebar-collapsed .app-header .app-user-text,
  .app-header.app-sidebar-collapsed .app-logout-button,
  .app-shell.app-sidebar-collapsed .app-header .app-logout-button,
  .app-header.app-sidebar-collapsed .app-sidebar-trademark,
  .app-shell.app-sidebar-collapsed .app-header .app-sidebar-trademark {
    display: none !important;
  }

  .app-header.app-sidebar-collapsed .app-brand-logo-wrap,
  .app-header.app-sidebar-collapsed .app-brand-logo,
  .app-shell.app-sidebar-collapsed .app-header .app-brand-logo-wrap,
  .app-shell.app-sidebar-collapsed .app-header .app-brand-logo {
    width: 42px !important;
    height: 42px !important;
  }

  .app-header.app-sidebar-collapsed .app-sidebar-toggle,
  .app-shell.app-sidebar-collapsed .app-header .app-sidebar-toggle {
    align-self: center !important;
    width: 42px !important;
    height: 36px !important;
    border-radius: 14px !important;
  }

  .app-header.app-sidebar-collapsed .app-desktop-nav,
  .app-shell.app-sidebar-collapsed .app-header .app-desktop-nav {
    align-items: center !important;
    padding-top: 4px !important;
  }

  .app-header.app-sidebar-collapsed .app-nav-link,
  .app-shell.app-sidebar-collapsed .app-header .app-nav-link {
    width: 42px !important;
    height: 42px !important;
    min-height: 42px !important;
    justify-content: center !important;
    padding: 0 !important;
    border-radius: 15px !important;
  }

  .app-header.app-sidebar-collapsed .app-user-area,
  .app-shell.app-sidebar-collapsed .app-header .app-user-area {
    display: flex !important;
    justify-content: center !important;
    margin-top: 6px !important;
    padding: 10px 0 0 !important;
  }

  .app-header.app-sidebar-collapsed .app-user-avatar,
  .app-shell.app-sidebar-collapsed .app-header .app-user-avatar {
    width: 42px !important;
    height: 42px !important;
    font-size: 0.56rem !important;
  }
}

@media (min-width: 901px) and (max-width: 1180px) {
  :root {
    --pms10-sidebar-open: 224px;
    --pms10-sidebar-closed: 70px;
    --pms10-content-pad: 16px;
  }

  .app-brand-title {
    font-size: 0.74rem !important;
  }

  .app-brand-subtitle {
    font-size: 0.48rem !important;
  }

  .app-brand-unit {
    font-size: 0.52rem !important;
  }

  .app-nav-link {
    min-height: 39px !important;
    padding: 8px 9px !important;
    font-size: 0.72rem !important;
  }
}

/* Phone layout remains untouched. */
@media (max-width: 900px) {
  .app-shell {
    padding-left: 0 !important;
  }

  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }
}
`

css += finalCss
fs.writeFileSync(cssPath, css)

console.log('Final sidebar width override applied.')
