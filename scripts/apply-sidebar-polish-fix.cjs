const fs = require('fs')
const path = require('path')

const layoutPath = path.join(process.cwd(), 'src/components/Layout.tsx')
const cssPath = path.join(process.cwd(), 'src/styles/layout.css')

if (!fs.existsSync(layoutPath)) {
  console.error('Missing file: src/components/Layout.tsx')
  process.exit(1)
}

if (!fs.existsSync(cssPath)) {
  console.error('Missing file: src/styles/layout.css')
  process.exit(1)
}

let layout = fs.readFileSync(layoutPath, 'utf8')
let css = fs.readFileSync(cssPath, 'utf8')
let changed = false

function replaceOnce(search, replacement, label) {
  if (!layout.includes(search)) {
    return false
  }

  layout = layout.replace(search, replacement)
  changed = true
  console.log(`Patched: ${label}`)
  return true
}

function stripCssBlock(source, marker) {
  const index = source.indexOf(marker)

  if (index < 0) return source

  const commentStart = source.lastIndexOf('/*', index)
  const blockStart = commentStart >= 0 ? commentStart : index
  const nextBlock = source.indexOf('/* =========================', index + marker.length)

  changed = true
  console.log(`Removed old CSS block: ${marker}`)

  if (nextBlock >= 0) {
    return source.slice(0, blockStart) + source.slice(nextBlock)
  }

  return source.slice(0, blockStart)
}

// Clean previous sidebar attempts to prevent conflicting width/height rules.
css = stripCssBlock(css, 'PMS10 DESKTOP SIDEBAR NAVIGATION')
css = stripCssBlock(css, 'PMS10 COLLAPSIBLE DESKTOP SIDEBAR')
css = stripCssBlock(css, 'PMS10 POLISHED DESKTOP SIDEBAR')

// Ensure collapsed state exists.
if (!layout.includes('desktopSidebarCollapsed')) {
  replaceOnce(
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
    'desktop sidebar collapsed state',
  )
}

// Persist collapsed state.
if (!layout.includes("pms10-desktop-sidebar-collapsed', desktopSidebarCollapsed")) {
  replaceOnce(
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
    'persist desktop sidebar collapsed state',
  )
}

// Shell collapsed class.
if (!layout.includes("desktopSidebarCollapsed ? 'app-sidebar-collapsed' : ''")) {
  replaceOnce(
    `    'app-shell',
    isScrolled ? 'app-scrolled' : '',`,
    `    'app-shell',
    desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',
    isScrolled ? 'app-scrolled' : '',`,
    'shell collapsed class',
  )
}

// Header collapsed class. Handle both old compact and single-line versions.
if (!layout.includes("'app-header',\n        desktopSidebarCollapsed ? 'app-sidebar-collapsed' : '',")) {
  if (!replaceOnce(
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
    replaceOnce(
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

// Add toggle button if missing.
if (!layout.includes('app-sidebar-toggle')) {
  replaceOnce(
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
    'desktop sidebar toggle button',
  )
}

// Add nav label class if missing.
if (!layout.includes('className="app-nav-label"')) {
  replaceOnce(
    `                <span>{item.label}</span>`,
    `                <span className="app-nav-label">{item.label}</span>`,
    'desktop nav label class',
  )
}

// Add trademark if missing.
if (!layout.includes('app-sidebar-trademark')) {
  replaceOnce(
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
    'sidebar trademark statement',
  )
}

const polishedCss = `
/* =========================
   PMS10 POLISHED DESKTOP SIDEBAR
   Desktop only. Mobile layout remains untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --app-sidebar-expanded-w: 248px;
    --app-sidebar-collapsed-w: 76px;
    --app-page-pad: 22px;
  }

  .app-shell,
  .app-shell.app-scrolled {
    min-height: 100vh !important;
    padding-top: 0 !important;
    padding-left: var(--app-sidebar-expanded-w) !important;
    padding-bottom: 0 !important;
    --current-header-h: 0px !important;
    transition: padding-left 0.18s ease !important;
  }

  .app-shell.app-sidebar-collapsed {
    padding-left: var(--app-sidebar-collapsed-w) !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header {
    position: fixed !important;
    top: 14px !important;
    left: 12px !important;
    right: auto !important;
    bottom: 14px !important;
    width: calc(var(--app-sidebar-expanded-w) - 24px) !important;
    height: calc(100vh - 28px) !important;
    min-height: 0 !important;
    max-height: calc(100vh - 28px) !important;
    padding: 12px !important;
    border-radius: 24px !important;
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%),
      linear-gradient(180deg, #07305f 0%, #0f4c86 58%, #1d6bc0 100%) !important;
    box-shadow: 12px 0 34px rgba(15, 23, 42, 0.16) !important;
    overflow: hidden !important;
    z-index: 1000 !important;
    transition:
      width 0.18s ease,
      padding 0.18s ease,
      border-radius 0.18s ease,
      box-shadow 0.18s ease !important;
  }

  .app-header.app-sidebar-collapsed {
    width: calc(var(--app-sidebar-collapsed-w) - 24px) !important;
    padding: 10px 8px !important;
    border-radius: 22px !important;
  }

  .app-header-inner {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 10px !important;
  }

  .app-brand {
    width: 100% !important;
    min-height: 58px !important;
    padding: 4px 2px 10px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.14) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo,
  .app-scrolled .app-brand-logo-wrap,
  .app-scrolled .app-brand-logo {
    width: 44px !important;
    height: 44px !important;
    flex: 0 0 auto !important;
  }

  .app-brand-text {
    min-width: 0 !important;
    display: block !important;
  }

  .app-brand-title {
    font-size: 0.88rem !important;
    letter-spacing: 0.04em !important;
    line-height: 1.05 !important;
  }

  .app-brand-subtitle {
    margin-top: 3px !important;
    font-size: 0.54rem !important;
    letter-spacing: 0.045em !important;
    white-space: normal !important;
    line-height: 1.08 !important;
    opacity: 0.9 !important;
  }

  .app-brand-unit,
  .app-scrolled .app-brand-unit {
    display: block !important;
    max-height: none !important;
    margin-top: 4px !important;
    font-size: 0.58rem !important;
    opacity: 0.74 !important;
    white-space: normal !important;
    line-height: 1.12 !important;
  }

  .app-sidebar-toggle {
    width: 40px !important;
    height: 38px !important;
    min-height: 38px !important;
    flex: 0 0 auto !important;
    display: grid !important;
    place-items: center !important;
    align-self: flex-end !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 14px !important;
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
    width: 20px !important;
    height: 20px !important;
    fill: currentColor !important;
  }

  .app-desktop-nav {
    width: 100% !important;
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
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    border-radius: 15px !important;
    padding: 10px 11px !important;
    color: rgba(255, 255, 255, 0.84) !important;
    font-size: 0.8rem !important;
    font-weight: 900 !important;
    letter-spacing: 0.005em !important;
    overflow: hidden !important;
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
    width: 19px !important;
    height: 19px !important;
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
    grid-template-columns: 40px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 8px !important;
  }

  .app-user-avatar {
    width: 40px !important;
    height: 40px !important;
  }

  .app-user-name {
    max-width: 100% !important;
    font-size: 0.72rem !important;
    line-height: 1.1 !important;
  }

  .app-user-role {
    margin-top: 2px !important;
    font-size: 0.58rem !important;
  }

  .app-logout-button {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-height: 36px !important;
    margin-top: 8px !important;
    border-radius: 14px !important;
    font-size: 0.72rem !important;
  }

  .app-user-logout-inline {
    display: none !important;
  }

  .app-sidebar-trademark {
    width: 100% !important;
    flex: 0 0 auto !important;
    margin-top: 8px !important;
    padding: 8px 6px !important;
    border-radius: 14px !important;
    background: rgba(255, 255, 255, 0.09) !important;
    color: rgba(255, 255, 255, 0.82) !important;
    text-align: center !important;
    line-height: 1.16 !important;
  }

  .app-sidebar-trademark span,
  .app-sidebar-trademark small {
    display: block !important;
    color: rgba(255, 255, 255, 0.68) !important;
    font-size: 0.48rem !important;
    font-weight: 850 !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
  }

  .app-sidebar-trademark strong {
    display: block !important;
    margin: 3px 0 2px !important;
    color: #ffffff !important;
    font-size: 0.62rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.04em !important;
    text-transform: uppercase !important;
  }

  .app-main {
    width: min(1580px, 100%) !important;
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

  .app-header.app-sidebar-collapsed .app-brand {
    justify-content: center !important;
    min-height: 52px !important;
    padding: 2px 0 8px !important;
  }

  .app-header.app-sidebar-collapsed .app-brand-text,
  .app-header.app-sidebar-collapsed .app-nav-label,
  .app-header.app-sidebar-collapsed .app-user-text,
  .app-header.app-sidebar-collapsed .app-logout-button,
  .app-header.app-sidebar-collapsed .app-sidebar-trademark {
    display: none !important;
  }

  .app-header.app-sidebar-collapsed .app-brand-logo-wrap,
  .app-header.app-sidebar-collapsed .app-brand-logo,
  .app-header.app-sidebar-collapsed.app-scrolled .app-brand-logo-wrap,
  .app-header.app-sidebar-collapsed.app-scrolled .app-brand-logo {
    width: 44px !important;
    height: 44px !important;
  }

  .app-header.app-sidebar-collapsed .app-sidebar-toggle {
    align-self: center !important;
    width: 44px !important;
    height: 38px !important;
    border-radius: 15px !important;
  }

  .app-header.app-sidebar-collapsed .app-desktop-nav {
    align-items: center !important;
    padding-top: 4px !important;
  }

  .app-header.app-sidebar-collapsed .app-nav-link {
    width: 46px !important;
    height: 44px !important;
    min-height: 44px !important;
    justify-content: center !important;
    padding: 0 !important;
    border-radius: 16px !important;
  }

  .app-header.app-sidebar-collapsed .app-user-area {
    display: flex !important;
    justify-content: center !important;
    margin-top: 6px !important;
    padding: 10px 0 0 !important;
  }

  .app-header.app-sidebar-collapsed .app-user-avatar {
    width: 44px !important;
    height: 44px !important;
    font-size: 0.58rem !important;
  }
}

@media (min-width: 901px) and (max-width: 1180px) {
  :root {
    --app-sidebar-expanded-w: 224px;
    --app-sidebar-collapsed-w: 72px;
    --app-page-pad: 16px;
  }

  .app-brand-title {
    font-size: 0.78rem !important;
  }

  .app-brand-subtitle {
    font-size: 0.5rem !important;
  }

  .app-brand-unit {
    font-size: 0.54rem !important;
  }

  .app-nav-link {
    min-height: 40px !important;
    padding: 9px 10px !important;
    font-size: 0.74rem !important;
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

css += polishedCss
fs.writeFileSync(cssPath, css)
fs.writeFileSync(layoutPath, layout)

if (changed) {
  console.log('Layout component patched.')
}

console.log('Sidebar polish fix applied.')
