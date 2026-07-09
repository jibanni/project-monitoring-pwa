const fs = require('fs')
const path = require('path')

const cssPath = path.join(process.cwd(), 'src/styles/layout.css')

if (!fs.existsSync(cssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

let css = fs.readFileSync(cssPath, 'utf8')

const marker = 'PMS10 DESKTOP SIDEBAR NAVIGATION'

const sidebarCss = `
/* =========================
   PMS10 DESKTOP SIDEBAR NAVIGATION
   Desktop/tablet only. Phone layout remains untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --app-sidebar-w: 292px;
    --app-page-pad: 24px;
  }

  .app-shell,
  .app-shell.app-scrolled {
    min-height: 100vh !important;
    padding-top: 0 !important;
    padding-left: var(--app-sidebar-w) !important;
    padding-bottom: 24px !important;
    --current-header-h: 100vh !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header {
    position: fixed !important;
    inset: 0 auto 0 0 !important;
    width: var(--app-sidebar-w) !important;
    height: 100vh !important;
    min-height: 100vh !important;
    padding: 18px 16px !important;
    border-radius: 0 30px 30px 0 !important;
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.18), transparent 34%),
      linear-gradient(180deg, #082f60 0%, #0f477f 58%, #1d6ec2 100%) !important;
    box-shadow: 18px 0 44px rgba(15, 23, 42, 0.18) !important;
    overflow: hidden !important;
  }

  .app-header-inner {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 18px !important;
  }

  .app-brand {
    width: 100% !important;
    min-height: 74px !important;
    align-items: center !important;
    justify-content: flex-start !important;
    padding: 8px 6px 14px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16) !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo,
  .app-scrolled .app-brand-logo-wrap,
  .app-scrolled .app-brand-logo {
    width: 54px !important;
    height: 54px !important;
  }

  .app-brand-text {
    min-width: 0 !important;
  }

  .app-brand-title {
    font-size: 1.05rem !important;
    letter-spacing: 0.05em !important;
  }

  .app-brand-subtitle {
    margin-top: 4px !important;
    font-size: 0.66rem !important;
    letter-spacing: 0.055em !important;
    white-space: normal !important;
    line-height: 1.12 !important;
  }

  .app-brand-unit,
  .app-scrolled .app-brand-unit {
    display: block !important;
    max-height: none !important;
    margin-top: 6px !important;
    opacity: 0.84 !important;
    white-space: normal !important;
    line-height: 1.16 !important;
  }

  .app-desktop-nav {
    width: 100% !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 8px !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 4px 2px 10px !important;
    scrollbar-width: thin !important;
    scrollbar-color: rgba(255, 255, 255, 0.42) rgba(255, 255, 255, 0.08) !important;
  }

  .app-desktop-nav::-webkit-scrollbar {
    width: 6px !important;
    height: 0 !important;
  }

  .app-desktop-nav::-webkit-scrollbar-thumb {
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.38) !important;
  }

  .app-nav-link {
    width: 100% !important;
    min-height: 48px !important;
    justify-content: flex-start !important;
    gap: 12px !important;
    border-radius: 18px !important;
    padding: 12px 14px !important;
    color: rgba(255, 255, 255, 0.86) !important;
    font-size: 0.9rem !important;
    font-weight: 900 !important;
    letter-spacing: 0.01em !important;
  }

  .app-nav-link:hover {
    transform: translateX(2px) !important;
    background: rgba(255, 255, 255, 0.13) !important;
    color: #ffffff !important;
  }

  .app-nav-link.active {
    background: #ffffff !important;
    color: var(--app-blue-800) !important;
    box-shadow: 0 16px 30px rgba(15, 23, 42, 0.22) !important;
    transform: translateX(0) !important;
  }

  .app-nav-icon,
  .app-nav-icon svg {
    width: 20px !important;
    height: 20px !important;
  }

  .app-user-area {
    width: 100% !important;
    margin-top: auto !important;
    padding: 14px 6px 6px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.16) !important;
    display: grid !important;
    grid-template-columns: 46px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
  }

  .app-user-avatar {
    width: 46px !important;
    height: 46px !important;
  }

  .app-user-text {
    min-width: 0 !important;
  }

  .app-user-name {
    max-width: 100% !important;
    font-size: 0.83rem !important;
  }

  .app-user-role {
    font-size: 0.68rem !important;
  }

  .app-logout-button {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-height: 42px !important;
    margin-top: 8px !important;
    border-radius: 16px !important;
  }

  .app-user-logout-inline {
    display: none !important;
  }

  .app-main {
    width: min(1540px, 100%) !important;
    margin: 0 auto !important;
    padding: 18px var(--app-page-pad) 34px !important;
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
}

@media (min-width: 901px) and (max-width: 1180px) {
  :root {
    --app-sidebar-w: 252px;
    --app-page-pad: 18px;
  }

  .app-brand-title {
    font-size: 0.94rem !important;
  }

  .app-brand-subtitle {
    font-size: 0.6rem !important;
  }

  .app-brand-unit {
    font-size: 0.66rem !important;
  }

  .app-nav-link {
    min-height: 46px !important;
    padding: 11px 12px !important;
    font-size: 0.84rem !important;
  }
}

/* Phone layout remains the same. */
@media (max-width: 900px) {
  .app-shell {
    padding-left: 0 !important;
  }
}
`

if (css.includes(marker)) {
  console.log('Desktop sidebar navigation CSS already exists. No changes made.')
} else {
  css += sidebarCss
  fs.writeFileSync(cssPath, css)
  console.log('Added desktop sidebar navigation CSS to src/styles/layout.css')
}
