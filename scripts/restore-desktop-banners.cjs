const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')
const projectsCssPath = path.join(projectRoot, 'src/styles/projects.css')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

function appendOnce(filePath, marker, cssBlock) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Missing file: ${path.relative(projectRoot, filePath)}`)
    return
  }

  let css = fs.readFileSync(filePath, 'utf8')

  const index = css.indexOf(marker)
  if (index >= 0) {
    const start = css.lastIndexOf('/*', index)
    const safeStart = start >= 0 ? start : index
    const next = css.indexOf('/* =========================', index + marker.length)
    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  }

  css += cssBlock
  fs.writeFileSync(filePath, css)
  console.log(`Updated ${path.relative(projectRoot, filePath)}`)
}

const layoutCss = `
/* =========================
   PMS10 DESKTOP BANNER RESTORE FIX - LAYOUT
   Force desktop topbar and normal content flow.
========================= */

@media (min-width: 901px) {
  .app-shell,
  .app-shell.app-scrolled,
  .app-shell.app-sidebar-collapsed {
    padding-top: 76px !important;
    padding-left: 0 !important;
    --current-header-h: 76px !important;
    --app-header-live-h: 76px !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-header.app-sidebar-collapsed,
  .app-scrolled .app-header,
  .app-shell .app-header,
  .app-shell.app-sidebar-collapsed .app-header {
    position: fixed !important;
    inset: 0 0 auto 0 !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    height: 76px !important;
    min-height: 76px !important;
    max-height: 76px !important;
    padding: 10px 24px !important;
    border-radius: 0 !important;
    border: 0 !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22) !important;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)) !important;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08) !important;
    overflow: visible !important;
  }

  .app-main {
    padding-top: 18px !important;
  }

  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }
}
`

const dashboardCss = `
/* =========================
   PMS10 DESKTOP BANNER RESTORE FIX
   Restores the Dashboard banner and disables desktop merge/fixed banner behavior.
========================= */

@media (min-width: 901px) {
  .dashboard-page,
  .dashboard-page.is-dashboard-scrolled {
    padding-top: 0 !important;
    margin-top: 0 !important;
    overflow: visible !important;
  }

  .dashboard-hero,
  .dashboard-page.is-dashboard-scrolled .dashboard-hero {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    z-index: 1 !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 132px !important;
    max-height: none !important;
    height: auto !important;
    margin: 0 0 18px !important;
    padding: 30px 32px !important;
    border-radius: 30px !important;
    overflow: hidden !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    gap: 20px !important;
    color: #ffffff !important;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 34%),
      linear-gradient(135deg, #123f73 0%, #18599d 56%, #2368b5 100%) !important;
    box-shadow: 0 22px 48px rgba(15, 48, 87, 0.18) !important;
    transform: none !important;
  }

  .dashboard-hero::after,
  .dashboard-page.is-dashboard-scrolled .dashboard-hero::after {
    content: '' !important;
    display: block !important;
    position: absolute !important;
    top: -80px !important;
    right: -80px !important;
    width: 240px !important;
    height: 240px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.11) !important;
    pointer-events: none !important;
  }

  .dashboard-eyebrow,
  .dashboard-page.is-dashboard-scrolled .dashboard-eyebrow {
    display: inline-flex !important;
    margin: 0 0 8px !important;
    color: #fed7aa !important;
    font-size: 0.74rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.16em !important;
    text-transform: uppercase !important;
  }

  .dashboard-hero h1,
  .dashboard-page.is-dashboard-scrolled .dashboard-hero h1 {
    max-width: 900px !important;
    margin: 0 !important;
    overflow: visible !important;
    color: #ffffff !important;
    font-size: clamp(2.3rem, 6vw, 4rem) !important;
    font-weight: 950 !important;
    line-height: 0.98 !important;
    letter-spacing: -0.045em !important;
    white-space: normal !important;
    text-overflow: clip !important;
  }

  .dashboard-hero p:not(.dashboard-eyebrow),
  .dashboard-page.is-dashboard-scrolled .dashboard-hero p:not(.dashboard-eyebrow) {
    display: block !important;
    max-width: 780px !important;
    margin: 14px 0 0 !important;
    color: rgba(255, 255, 255, 0.88) !important;
    font-size: 1rem !important;
    font-weight: 750 !important;
    line-height: 1.55 !important;
  }
}
`

const projectsCss = `
/* =========================
   PMS10 DESKTOP BANNER RESTORE FIX
   Restores Project Registry banner and disables desktop merge/fixed banner behavior.
========================= */

@media (min-width: 901px) {
  .projects-page,
  .projects-page.is-registry-scrolled {
    padding-top: 0 !important;
    margin-top: 0 !important;
    overflow: visible !important;
  }

  .projects-hero-spacer,
  .projects-page.is-registry-scrolled .projects-hero-spacer {
    display: none !important;
    height: 0 !important;
  }

  .projects-hero,
  .projects-registry-hero,
  .projects-page.is-registry-scrolled .projects-hero,
  .projects-page.is-registry-scrolled .projects-registry-hero {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    z-index: 1 !important;
    width: 100% !important;
    min-height: 132px !important;
    max-height: none !important;
    height: auto !important;
    margin: 0 0 18px !important;
    padding: 28px 30px !important;
    border-radius: 30px !important;
    overflow: hidden !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    gap: 18px !important;
    color: #ffffff !important;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 34%),
      linear-gradient(135deg, #123f73 0%, #18599d 56%, #2368b5 100%) !important;
    box-shadow: 0 20px 46px rgba(15, 48, 87, 0.18) !important;
    transform: none !important;
  }

  .projects-hero::after,
  .projects-registry-hero::after,
  .projects-page.is-registry-scrolled .projects-hero::after,
  .projects-page.is-registry-scrolled .projects-registry-hero::after {
    content: '' !important;
    display: block !important;
    position: absolute !important;
    right: -82px !important;
    top: -86px !important;
    width: 250px !important;
    height: 250px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.11) !important;
    pointer-events: none !important;
  }

  .projects-eyebrow,
  .projects-page.is-registry-scrolled .projects-eyebrow {
    display: inline-flex !important;
    margin: 0 0 8px !important;
    color: #fed7aa !important;
    font-size: 0.74rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.16em !important;
    line-height: 1.2 !important;
    text-transform: uppercase !important;
  }

  .projects-hero h1,
  .projects-page.is-registry-scrolled .projects-hero h1 {
    max-width: 920px !important;
    margin: 0 !important;
    overflow: visible !important;
    color: #ffffff !important;
    font-size: clamp(2.25rem, 6vw, 3.8rem) !important;
    font-weight: 950 !important;
    line-height: 0.98 !important;
    letter-spacing: -0.04em !important;
    white-space: normal !important;
    text-overflow: clip !important;
  }

  .projects-hero p,
  .projects-page.is-registry-scrolled .projects-hero p {
    display: block !important;
    max-width: 780px !important;
    margin: 14px 0 0 !important;
    color: rgba(255, 255, 255, 0.88) !important;
    font-size: 0.98rem !important;
    font-weight: 750 !important;
    line-height: 1.55 !important;
  }
}
`

appendOnce(layoutCssPath, 'PMS10 DESKTOP BANNER RESTORE FIX - LAYOUT', layoutCss)
appendOnce(dashboardCssPath, 'PMS10 DESKTOP BANNER RESTORE FIX', dashboardCss)
appendOnce(projectsCssPath, 'PMS10 DESKTOP BANNER RESTORE FIX', projectsCss)

console.log('Desktop banner restore fix applied.')
