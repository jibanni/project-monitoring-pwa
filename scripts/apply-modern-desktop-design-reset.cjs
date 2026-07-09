const fs = require('fs')
const path = require('path')

const root = process.cwd()
const layoutPath = path.join(root, 'src/components/Layout.tsx')
const layoutCssPath = path.join(root, 'src/styles/layout.css')
const dashboardCssPath = path.join(root, 'src/styles/dashboard.css')
const projectsCssPath = path.join(root, 'src/styles/projects.css')

function backup(filePath) {
  if (!fs.existsSync(filePath)) return
  const backupPath = `${filePath}.desktop-reset.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(root, backupPath)}`)
  }
}

function stripOldBlocks(css) {
  const markers = [
    'PMS10 DESKTOP SIDEBAR NAVIGATION',
    'PMS10 COLLAPSIBLE DESKTOP SIDEBAR',
    'PMS10 POLISHED DESKTOP SIDEBAR',
    'PMS10 SIDEBAR FINAL WIDTH OVERRIDE',
    'PMS10 SIDEBAR POLISH FIX',
    'PMS10 MODERN DESKTOP DESIGN RESET',
  ]

  let out = css
  for (const marker of markers) {
    let index = out.indexOf(marker)
    while (index >= 0) {
      const start = Math.max(0, out.lastIndexOf('/*', index))
      const next = out.indexOf('/* =========================', index + marker.length)
      out = next >= 0 ? out.slice(0, start) + out.slice(next) : out.slice(0, start)
      index = out.indexOf(marker)
    }
  }
  return out
}

function patchLayout() {
  if (!fs.existsSync(layoutPath)) {
    console.warn('Skipped missing src/components/Layout.tsx')
    return
  }

  backup(layoutPath)
  let code = fs.readFileSync(layoutPath, 'utf8')
  let changed = false

  function rep(search, replacement, label) {
    if (!code.includes(search)) return false
    code = code.replace(search, replacement)
    changed = true
    console.log(`Patched: ${label}`)
    return true
  }

  if (!code.includes('desktopSidebarCollapsed')) {
    rep(
      "  const [headerPortalReady, setHeaderPortalReady] = useState(false)\n",
      `  const [headerPortalReady, setHeaderPortalReady] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('pms10-desktop-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })

`,
      'desktop collapsed state',
    )
  }

  if (!code.includes("pms10-desktop-sidebar-collapsed', desktopSidebarCollapsed")) {
    rep(
      `  useEffect(() => {
    setHeaderPortalReady(true)
  }, [])

`,
      `  useEffect(() => {
    setHeaderPortalReady(true)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'pms10-desktop-sidebar-collapsed',
        desktopSidebarCollapsed ? '1' : '0',
      )
    } catch {
      // Ignore localStorage write errors.
    }
  }, [desktopSidebarCollapsed])

`,
      'persist collapsed state',
    )
  }

  if (!code.includes("desktopSidebarCollapsed ? 'app-sidebar-collapsed' : ''")) {
    if (!rep(
      `    'app-shell',
    isScrolled ? 'app-scrolled' : '',`,
      `    'app-shell',
    desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',
    isScrolled ? 'app-scrolled' : '',`,
      'shell collapsed class',
    )) {
      rep(
        `className={['app-shell', isScrolled ? 'app-scrolled' : ''].filter(Boolean).join(' ')}`,
        `className={[
        'app-shell',
        desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',
        isScrolled ? 'app-scrolled' : '',
      ]
        .filter(Boolean)
        .join(' ')}`,
        'shell collapsed class alternate',
      )
    }
  }

  if (!code.includes("'app-header',\n        desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',")) {
    if (!rep(
      `      className={['app-header', isScrolled ? 'app-header-scrolled' : '']
        .filter(Boolean)
        .join(' ')}`,
      `      className={[
        'app-header',
        desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',
        isScrolled ? 'app-header-scrolled' : '',
      ]
        .filter(Boolean)
        .join(' ')}`,
      'header collapsed class',
    )) {
      rep(
        `      className={[
        'app-header',
        isScrolled ? 'app-header-scrolled' : '',
      ]
        .filter(Boolean)
        .join(' ')}`,
        `      className={[
        'app-header',
        desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',
        isScrolled ? 'app-header-scrolled' : '',
      ]
        .filter(Boolean)
        .join(' ')}`,
        'header collapsed class alternate',
      )
    }
  }

  if (!code.includes('app-sidebar-toggle')) {
    rep(
      `        </NavLink>

        <nav className="app-desktop-nav" aria-label="Main navigation">`,
      `        </NavLink>

        <button
          type="button"
          className="app-sidebar-toggle"
          onClick={() => setDesktopSidebarCollapsed((current) => !current)}
          aria-label={desktopSidebarCollapsed ? 'Expand sidebar menu' : 'Collapse sidebar menu'}
          title={desktopSidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6.5h16v2H4v-2Zm0 4.75h16v2H4v-2ZM4 16h16v2H4v-2Z" />
          </svg>
        </button>

        <nav className="app-desktop-nav" aria-label="Main navigation">`,
      'desktop sidebar toggle',
    )
  }

  if (!code.includes('className="app-nav-label"')) {
    rep(`                <span>{item.label}</span>`, `                <span className="app-nav-label">{item.label}</span>`, 'nav label class')
  }

  if (!code.includes('app-sidebar-trademark')) {
    rep(
      `          <button type="button" className="app-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>`,
      `          <button type="button" className="app-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="app-sidebar-trademark" aria-label="Development credit">
          <span>Developed by</span>
          <strong>PDMU Region X</strong>
          <small>DILG Regional Office X</small>
        </div>
      </div>`,
      'sidebar trademark',
    )
  }

  if (changed) fs.writeFileSync(layoutPath, code)
  console.log(changed ? 'Layout patched.' : 'Layout already OK.')
}

const layoutCss = String.raw`
/* =========================
   PMS10 MODERN DESKTOP DESIGN RESET
   Desktop-only SaaS layout. Mobile view remains untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --pms10-sidebar-open: 244px;
    --pms10-sidebar-closed: 76px;
    --pms10-page-pad-x: 24px;
    --pms10-page-pad-y: 20px;
    --pms10-bg: #f3f7fb;
    --pms10-card: #ffffff;
    --pms10-border: rgba(148, 163, 184, 0.22);
    --pms10-text: #0f172a;
    --pms10-muted: #64748b;
    --pms10-blue: #0f4c81;
    --pms10-blue-2: #145da0;
  }

  html, body, #root { background: var(--pms10-bg) !important; }
  body { overflow-x: hidden !important; }

  .app-shell,
  .app-shell.app-scrolled {
    width: 100% !important;
    min-height: 100vh !important;
    background: var(--pms10-bg) !important;
    padding-top: 0 !important;
    padding-left: var(--pms10-sidebar-open) !important;
    padding-bottom: 0 !important;
    --current-header-h: 0px !important;
    transition: padding-left 180ms ease !important;
  }

  .app-shell.app-sidebar-collapsed { padding-left: var(--pms10-sidebar-closed) !important; }

  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header,
  .app-shell .app-header {
    position: fixed !important;
    z-index: 1000 !important;
    inset: 12px auto 12px 12px !important;
    width: calc(var(--pms10-sidebar-open) - 24px) !important;
    min-width: calc(var(--pms10-sidebar-open) - 24px) !important;
    max-width: calc(var(--pms10-sidebar-open) - 24px) !important;
    height: calc(100dvh - 24px) !important;
    min-height: 0 !important;
    max-height: calc(100dvh - 24px) !important;
    margin: 0 !important;
    padding: 12px !important;
    overflow: hidden !important;
    border: 1px solid rgba(15, 76, 129, 0.12) !important;
    border-radius: 24px !important;
    background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.96)) !important;
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.10) !important;
    color: var(--pms10-text) !important;
    transform: none !important;
    transition: width 180ms ease, min-width 180ms ease, max-width 180ms ease, padding 180ms ease !important;
  }

  .app-header.app-sidebar-collapsed,
  .app-shell.app-sidebar-collapsed .app-header {
    width: calc(var(--pms10-sidebar-closed) - 24px) !important;
    min-width: calc(var(--pms10-sidebar-closed) - 24px) !important;
    max-width: calc(var(--pms10-sidebar-closed) - 24px) !important;
    padding: 10px 8px !important;
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
    min-height: 62px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    padding: 4px 2px 12px !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22) !important;
  }

  .app-brand-logo-wrap, .app-brand-logo, .app-scrolled .app-brand-logo-wrap, .app-scrolled .app-brand-logo {
    width: 44px !important;
    height: 44px !important;
    flex: 0 0 auto !important;
    border-radius: 999px !important;
  }

  .app-brand-text { min-width: 0 !important; display: block !important; }
  .app-brand-title { color: var(--pms10-text) !important; font-size: .86rem !important; font-weight: 950 !important; letter-spacing: .035em !important; line-height: 1.05 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
  .app-brand-subtitle { margin-top: 3px !important; color: #1e3a5f !important; font-size: .52rem !important; font-weight: 900 !important; letter-spacing: .045em !important; white-space: normal !important; line-height: 1.12 !important; opacity: .9 !important; }
  .app-brand-unit, .app-scrolled .app-brand-unit { display: block !important; max-height: none !important; margin-top: 4px !important; color: var(--pms10-muted) !important; font-size: .58rem !important; font-weight: 750 !important; opacity: 1 !important; white-space: normal !important; line-height: 1.16 !important; }

  .app-sidebar-toggle {
    width: 38px !important;
    height: 36px !important;
    min-height: 36px !important;
    flex: 0 0 auto !important;
    display: grid !important;
    place-items: center !important;
    align-self: flex-end !important;
    border: 1px solid rgba(15, 76, 129, .15) !important;
    border-radius: 13px !important;
    padding: 0 !important;
    cursor: pointer !important;
    background: #eff6ff !important;
    color: var(--pms10-blue) !important;
    box-shadow: none !important;
  }
  .app-sidebar-toggle:hover { background: #dbeafe !important; }
  .app-sidebar-toggle svg { width: 19px !important; height: 19px !important; fill: currentColor !important; }

  .app-desktop-nav { width: 100% !important; max-width: 100% !important; min-height: 0 !important; flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important; gap: 6px !important; overflow-y: auto !important; overflow-x: hidden !important; padding: 2px 0 6px !important; scrollbar-width: none !important; }
  .app-desktop-nav::-webkit-scrollbar { display: none !important; }

  .app-nav-link { width: 100% !important; min-height: 40px !important; display: flex !important; align-items: center !important; justify-content: flex-start !important; gap: 10px !important; border-radius: 14px !important; padding: 9px 10px !important; color: #334155 !important; background: transparent !important; font-size: .76rem !important; font-weight: 900 !important; letter-spacing: .005em !important; overflow: hidden !important; white-space: nowrap !important; }
  .app-nav-link:hover { background: #eff6ff !important; color: var(--pms10-blue) !important; transform: none !important; }
  .app-nav-link.active { background: linear-gradient(135deg, #0f4c81, #145da0) !important; color: #ffffff !important; box-shadow: 0 12px 22px rgba(20, 93, 160, .22) !important; }
  .app-nav-icon, .app-nav-icon svg { width: 18px !important; height: 18px !important; flex: 0 0 auto !important; }
  .app-nav-label { min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

  .app-user-area { width: 100% !important; flex: 0 0 auto !important; margin-top: 6px !important; padding: 10px 2px 0 !important; border-top: 1px solid rgba(148, 163, 184, .22) !important; display: grid !important; grid-template-columns: 38px minmax(0, 1fr) !important; align-items: center !important; gap: 8px !important; }
  .app-user-avatar { width: 38px !important; height: 38px !important; background: #e0f2fe !important; color: var(--pms10-blue) !important; border: 1px solid rgba(20, 93, 160, .18) !important; }
  .app-user-name { max-width: 100% !important; color: var(--pms10-text) !important; font-size: .68rem !important; line-height: 1.1 !important; }
  .app-user-role { margin-top: 2px !important; color: var(--pms10-muted) !important; font-size: .54rem !important; }
  .app-logout-button { grid-column: 1 / -1 !important; width: 100% !important; min-height: 34px !important; margin-top: 8px !important; border-radius: 13px !important; background: #ef4444 !important; color: #fff !important; font-size: .68rem !important; box-shadow: 0 10px 22px rgba(239, 68, 68, .18) !important; }
  .app-user-logout-inline { display: none !important; }

  .app-sidebar-trademark { width: 100% !important; flex: 0 0 auto !important; margin-top: 8px !important; padding: 7px 6px !important; border-radius: 13px !important; background: #f8fafc !important; border: 1px solid rgba(148, 163, 184, .18) !important; text-align: center !important; line-height: 1.14 !important; }
  .app-sidebar-trademark span, .app-sidebar-trademark small { display: block !important; color: #94a3b8 !important; font-size: .44rem !important; font-weight: 850 !important; letter-spacing: .08em !important; text-transform: uppercase !important; }
  .app-sidebar-trademark strong { display: block !important; margin: 2px 0 !important; color: var(--pms10-blue) !important; font-size: .58rem !important; font-weight: 950 !important; letter-spacing: .04em !important; text-transform: uppercase !important; }

  .app-main { width: min(1580px, 100%) !important; margin: 0 auto !important; padding: var(--pms10-page-pad-y) var(--pms10-page-pad-x) 34px !important; }
  .dashboard-page, .projects-page, .pm-map-page, .reports-page, .offline-sync-page, .user-management-page, .create-project-page, .edit-project-page, .project-details-page, .pu-page { margin-top: 0 !important; }
  .app-mobile-nav { display: none !important; }

  .app-header.app-sidebar-collapsed .app-brand, .app-shell.app-sidebar-collapsed .app-header .app-brand { justify-content: center !important; min-height: 50px !important; padding: 2px 0 8px !important; }
  .app-header.app-sidebar-collapsed .app-brand-text, .app-shell.app-sidebar-collapsed .app-header .app-brand-text, .app-header.app-sidebar-collapsed .app-nav-label, .app-shell.app-sidebar-collapsed .app-header .app-nav-label, .app-header.app-sidebar-collapsed .app-user-text, .app-shell.app-sidebar-collapsed .app-header .app-user-text, .app-header.app-sidebar-collapsed .app-logout-button, .app-shell.app-sidebar-collapsed .app-header .app-logout-button, .app-header.app-sidebar-collapsed .app-sidebar-trademark, .app-shell.app-sidebar-collapsed .app-header .app-sidebar-trademark { display: none !important; }
  .app-header.app-sidebar-collapsed .app-brand-logo-wrap, .app-header.app-sidebar-collapsed .app-brand-logo, .app-shell.app-sidebar-collapsed .app-header .app-brand-logo-wrap, .app-shell.app-sidebar-collapsed .app-header .app-brand-logo { width: 42px !important; height: 42px !important; }
  .app-header.app-sidebar-collapsed .app-sidebar-toggle, .app-shell.app-sidebar-collapsed .app-header .app-sidebar-toggle { align-self: center !important; width: 42px !important; height: 36px !important; border-radius: 14px !important; }
  .app-header.app-sidebar-collapsed .app-desktop-nav, .app-shell.app-sidebar-collapsed .app-header .app-desktop-nav { align-items: center !important; padding-top: 4px !important; }
  .app-header.app-sidebar-collapsed .app-nav-link, .app-shell.app-sidebar-collapsed .app-header .app-nav-link { width: 42px !important; height: 42px !important; min-height: 42px !important; justify-content: center !important; padding: 0 !important; border-radius: 15px !important; }
  .app-header.app-sidebar-collapsed .app-user-area, .app-shell.app-sidebar-collapsed .app-header .app-user-area { display: flex !important; justify-content: center !important; margin-top: 6px !important; padding: 10px 0 0 !important; }
  .app-header.app-sidebar-collapsed .app-user-avatar, .app-shell.app-sidebar-collapsed .app-header .app-user-avatar { width: 42px !important; height: 42px !important; font-size: .56rem !important; }
}

@media (min-width: 901px) and (max-width: 1180px) {
  :root { --pms10-sidebar-open: 224px; --pms10-sidebar-closed: 70px; --pms10-page-pad-x: 16px; }
  .app-brand-title { font-size: .74rem !important; }
  .app-brand-subtitle { font-size: .48rem !important; }
  .app-brand-unit { font-size: .52rem !important; }
  .app-nav-link { min-height: 39px !important; padding: 8px 9px !important; font-size: .72rem !important; }
}

@media (max-width: 900px) {
  .app-shell { padding-left: 0 !important; }
  .app-sidebar-toggle, .app-sidebar-trademark { display: none !important; }
}
`

const dashboardCss = String.raw`
/* =========================
   PMS10 MODERN DESKTOP DESIGN RESET
   Dashboard desktop-only refinements.
========================= */

@media (min-width: 901px) {
  .dashboard-page { width: 100% !important; max-width: 100% !important; display: flex !important; flex-direction: column !important; gap: 18px !important; }
  .dashboard-hero, .dashboard-page .page-hero, .dashboard-page .hero-card, .dashboard-page [class*='hero'] { min-height: 118px !important; padding: 26px 28px !important; border-radius: 24px !important; margin: 0 0 4px !important; }
  .dashboard-hero h1, .dashboard-page .page-hero h1, .dashboard-page .hero-card h1, .dashboard-page [class*='hero'] h1 { font-size: clamp(2.2rem, 4.4vw, 4.4rem) !important; line-height: .96 !important; letter-spacing: -.045em !important; }
  .dashboard-hero p, .dashboard-page .page-hero p, .dashboard-page .hero-card p, .dashboard-page [class*='hero'] p { max-width: 980px !important; margin-top: 12px !important; font-size: .98rem !important; }
  .dashboard-stat-grid { display: grid !important; grid-template-columns: repeat(20, minmax(0, 1fr)) !important; gap: 14px !important; align-items: stretch !important; }
  .dashboard-stat-grid .dashboard-stat-card:nth-child(-n + 5) { grid-column: span 4 !important; }
  .dashboard-stat-grid .dashboard-stat-card:nth-child(n + 6) { grid-column: span 5 !important; }
  .dashboard-stat-card { min-height: 112px !important; border-radius: 22px !important; box-shadow: 0 12px 34px rgba(15, 23, 42, .08) !important; border: 1px solid rgba(148, 163, 184, .18) !important; }
  .dashboard-stat-card strong, .dashboard-stat-card .stat-value { font-size: clamp(1.65rem, 2.4vw, 2.45rem) !important; }
  .dashboard-charts-grid, .dashboard-priority-grid, .dashboard-section-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 18px !important; align-items: stretch !important; }
  .dashboard-chart-card, .dashboard-panel, .dashboard-card { border-radius: 24px !important; box-shadow: 0 12px 34px rgba(15, 23, 42, .07) !important; border: 1px solid rgba(148, 163, 184, .18) !important; }
  .dashboard-stat-card.under-procurement { border-top-color: #f97316 !important; }
  .dashboard-stat-card.not-started { border-top-color: #64748b !important; }
  .dashboard-stat-card.ongoing { border-top-color: #16a34a !important; }
  .dashboard-stat-card.completed { border-top-color: #2563eb !important; }
  .dashboard-stat-card.critical-status { border-top-color: #ef4444 !important; }
  .dashboard-stat-card.low-risk { border-top-color: #eab308 !important; }
  .dashboard-stat-card.medium-risk { border-top-color: #f97316 !important; }
  .dashboard-stat-card.high-risk { border-top-color: #ef4444 !important; }
}

@media (min-width: 901px) and (max-width: 1240px) {
  .dashboard-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .dashboard-stat-grid .dashboard-stat-card { grid-column: auto !important; }
}
`

const projectsCss = String.raw`
/* =========================
   PMS10 MODERN DESKTOP DESIGN RESET
   Project Registry desktop-only refinements.
========================= */

@media (min-width: 901px) {
  .projects-page { width: 100% !important; max-width: 100% !important; display: flex !important; flex-direction: column !important; gap: 18px !important; }
  .projects-hero, .projects-page .page-hero, .projects-page .hero-card, .projects-page [class*='hero'] { min-height: 112px !important; padding: 24px 28px !important; border-radius: 24px !important; margin: 0 0 4px !important; }
  .projects-hero h1, .projects-page .page-hero h1, .projects-page .hero-card h1, .projects-page [class*='hero'] h1 { font-size: clamp(2rem, 4vw, 4rem) !important; line-height: .96 !important; letter-spacing: -.045em !important; }
  .projects-hero p, .projects-page .page-hero p, .projects-page .hero-card p, .projects-page [class*='hero'] p { max-width: 920px !important; margin-top: 12px !important; font-size: .96rem !important; }
  .projects-summary-grid { display: grid !important; grid-template-columns: repeat(7, minmax(0, 1fr)) !important; gap: 14px !important; }
  .projects-summary-card { min-height: 104px !important; border-radius: 20px !important; box-shadow: 0 12px 30px rgba(15, 23, 42, .07) !important; border: 1px solid rgba(148, 163, 184, .18) !important; }
  .projects-search-panel, .project-list-panel, .projects-filter-panel, .projects-list-card { border-radius: 24px !important; box-shadow: 0 12px 34px rgba(15, 23, 42, .07) !important; border: 1px solid rgba(148, 163, 184, .18) !important; }
  .project-list-row, .project-card-row, .project-row { border-radius: 20px !important; }
}

@media (min-width: 901px) and (max-width: 1240px) {
  .projects-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
}
`

function patchCss(filePath, cssToAppend) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipped missing ${path.relative(root, filePath)}`)
    return
  }
  backup(filePath)
  let css = fs.readFileSync(filePath, 'utf8')
  css = stripOldBlocks(css)
  css += cssToAppend
  fs.writeFileSync(filePath, css)
}

patchLayout()
patchCss(layoutCssPath, layoutCss)
patchCss(dashboardCssPath, dashboardCss)
patchCss(projectsCssPath, projectsCss)

console.log('PMS10 modern desktop design reset applied. Mobile CSS is untouched by media query.')
