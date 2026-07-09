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
    console.warn(`Marker not found, skipped: ${label}`)
    return
  }

  layout = layout.replace(search, replacement)
  changed = true
  console.log(`Patched: ${label}`)
}

// 1. Add desktop collapsed state.
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

// 2. Persist collapsed state.
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

// 3. Add collapsed class to shell.
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

// 4. Add collapsed class to header.
if (!layout.includes("desktopSidebarCollapsed ? 'app-sidebar-collapsed' : ''}\n        .filter(Boolean)")) {
  replaceOnce(
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
  )
}

// 5. Add toggle button after brand.
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

// 6. Add nav label class for easier collapsed styling.
if (!layout.includes('className="app-nav-label"')) {
  replaceOnce(
    `                <span>{item.label}</span>`,
    `                <span className="app-nav-label">{item.label}</span>`,
    'desktop nav label class',
  )
}

// 7. Add trademark block near bottom.
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

fs.writeFileSync(layoutPath, layout)

const marker = 'PMS10 COLLAPSIBLE DESKTOP SIDEBAR'

const cssPatch = `
/* =========================
   PMS10 COLLAPSIBLE DESKTOP SIDEBAR
   Desktop only. Mobile layout remains untouched.
========================= */

@media (min-width: 901px) {
  :root {
    --app-sidebar-expanded-w: 262px;
    --app-sidebar-collapsed-w: 84px;
    --app-page-pad: 22px;
  }

  .app-shell,
  .app-shell.app-scrolled {
    min-height: 100vh !important;
    padding-top: 0 !important;
    padding-left: var(--app-sidebar-expanded-w) !important;
    padding-bottom: 24px !important;
    --current-header-h: 100vh !important;
  }

  .app-shell.app-sidebar-collapsed {
    padding-left: var(--app-sidebar-collapsed-w) !important;
  }

  .app-header,
  .app-header.app-header-scrolled,
  .app-scrolled .app-header {
    position: fixed !important;
    inset: 0 auto 0 0 !important;
    width: var(--app-sidebar-expanded-w) !important;
    height: 100vh !important;
    min-height: 100vh !important;
    padding: 16px 13px !important;
    border-radius: 0 24px 24px 0 !important;
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 33%),
      linear-gradient(180deg, #082f60 0%, #0f477f 58%, #1d6ec2 100%) !important;
    box-shadow: 16px 0 38px rgba(15, 23, 42, 0.18) !important;
    overflow: hidden !important;
    transition:
      width 0.2s ease,
      padding 0.2s ease,
      border-radius 0.2s ease,
      box-shadow 0.2s ease !important;
  }

  .app-header.app-sidebar-collapsed {
    width: var(--app-sidebar-collapsed-w) !important;
    padding: 14px 10px !important;
    border-radius: 0 22px 22px 0 !important;
  }

  .app-header-inner {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 12px !important;
  }

  .app-brand {
    width: 100% !important;
    min-height: 70px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    padding: 6px 4px 12px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.14) !important;
  }

  .app-brand-logo-wrap,
  .app-brand-logo,
  .app-scrolled .app-brand-logo-wrap,
  .app-scrolled .app-brand-logo {
    width: 50px !important;
    height: 50px !important;
  }

  .app-brand-title {
    font-size: 0.98rem !important;
    letter-spacing: 0.045em !important;
  }

  .app-brand-subtitle {
    margin-top: 4px !important;
    font-size: 0.61rem !important;
    letter-spacing: 0.05em !important;
    white-space: normal !important;
    line-height: 1.1 !important;
  }

  .app-brand-unit,
  .app-scrolled .app-brand-unit {
    display: block !important;
    max-height: none !important;
    margin-top: 5px !important;
    font-size: 0.66rem !important;
    opacity: 0.78 !important;
    white-space: normal !important;
    line-height: 1.14 !important;
  }

  .app-sidebar-toggle {
    width: 42px !important;
    height: 42px !important;
    min-height: 42px !important;
    flex: 0 0 auto !important;
    display: grid !important;
    place-items: center !important;
    align-self: flex-end !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    border-radius: 16px !important;
    padding: 0 !important;
    cursor: pointer !important;
    background: rgba(255, 255, 255, 0.12) !important;
    color: #ffffff !important;
    box-shadow: none !important;
    transition:
      background 0.16s ease,
      transform 0.16s ease !important;
  }

  .app-sidebar-toggle:hover {
    transform: translateY(-1px) !important;
    background: rgba(255, 255, 255, 0.2) !important;
  }

  .app-sidebar-toggle svg {
    width: 21px !important;
    height: 21px !important;
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
    gap: 7px !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 4px 0 8px !important;
    scrollbar-width: thin !important;
    scrollbar-color: rgba(255, 255, 255, 0.36) rgba(255, 255, 255, 0.08) !important;
  }

  .app-desktop-nav::-webkit-scrollbar {
    width: 5px !important;
    height: 0 !important;
  }

  .app-desktop-nav::-webkit-scrollbar-thumb {
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.34) !important;
  }

  .app-nav-link {
    width: 100% !important;
    min-height: 46px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 11px !important;
    border-radius: 17px !important;
    padding: 11px 12px !important;
    color: rgba(255, 255, 255, 0.86) !important;
    font-size: 0.86rem !important;
    font-weight: 900 !important;
    letter-spacing: 0.01em !important;
    overflow: hidden !important;
  }

  .app-nav-link:hover {
    transform: translateX(2px) !important;
    background: rgba(255, 255, 255, 0.13) !important;
    color: #ffffff !important;
  }

  .app-nav-link.active {
    background: #ffffff !important;
    color: var(--app-blue-800) !important;
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.2) !important;
    transform: none !important;
  }

  .app-nav-icon,
  .app-nav-icon svg {
    width: 20px !important;
    height: 20px !important;
    flex: 0 0 auto !important;
  }

  .app-nav-label {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .app-user-area {
    width: 100% !important;
    margin-top: 8px !important;
    padding: 12px 4px 4px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.14) !important;
    display: grid !important;
    grid-template-columns: 44px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 9px !important;
  }

  .app-user-avatar {
    width: 44px !important;
    height: 44px !important;
  }

  .app-user-name {
    max-width: 100% !important;
    font-size: 0.8rem !important;
  }

  .app-user-role {
    font-size: 0.65rem !important;
  }

  .app-logout-button {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-height: 40px !important;
    margin-top: 8px !important;
    border-radius: 15px !important;
  }

  .app-user-logout-inline {
    display: none !important;
  }

  .app-sidebar-trademark {
    width: 100% !important;
    margin-top: 10px !important;
    padding: 10px 8px !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.1) !important;
    color: rgba(255, 255, 255, 0.82) !important;
    text-align: center !important;
    line-height: 1.2 !important;
  }

  .app-sidebar-trademark span,
  .app-sidebar-trademark small {
    display: block !important;
    color: rgba(255, 255, 255, 0.72) !important;
    font-size: 0.58rem !important;
    font-weight: 850 !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
  }

  .app-sidebar-trademark strong {
    display: block !important;
    margin: 3px 0 2px !important;
    color: #ffffff !important;
    font-size: 0.72rem !important;
    font-weight: 950 !important;
    letter-spacing: 0.04em !important;
    text-transform: uppercase !important;
  }

  .app-main {
    width: min(1560px, 100%) !important;
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
    min-height: 58px !important;
    padding: 4px 0 10px !important;
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
    width: 48px !important;
    height: 48px !important;
  }

  .app-header.app-sidebar-collapsed .app-sidebar-toggle {
    align-self: center !important;
    width: 48px !important;
    height: 44px !important;
    border-radius: 16px !important;
  }

  .app-header.app-sidebar-collapsed .app-desktop-nav {
    align-items: center !important;
    padding-top: 6px !important;
  }

  .app-header.app-sidebar-collapsed .app-nav-link {
    width: 54px !important;
    height: 50px !important;
    min-height: 50px !important;
    justify-content: center !important;
    padding: 0 !important;
    border-radius: 18px !important;
  }

  .app-header.app-sidebar-collapsed .app-nav-link:hover {
    transform: translateY(-1px) !important;
  }

  .app-header.app-sidebar-collapsed .app-user-area {
    display: flex !important;
    justify-content: center !important;
    margin-top: 8px !important;
    padding: 12px 0 0 !important;
  }

  .app-header.app-sidebar-collapsed .app-user-avatar {
    width: 48px !important;
    height: 48px !important;
    font-size: 0.62rem !important;
  }
}

@media (min-width: 901px) and (max-width: 1180px) {
  :root {
    --app-sidebar-expanded-w: 238px;
    --app-sidebar-collapsed-w: 78px;
    --app-page-pad: 18px;
  }

  .app-brand-title {
    font-size: 0.86rem !important;
  }

  .app-brand-subtitle {
    font-size: 0.55rem !important;
  }

  .app-brand-unit {
    font-size: 0.6rem !important;
  }

  .app-nav-link {
    min-height: 44px !important;
    padding: 10px 11px !important;
    font-size: 0.8rem !important;
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

if (!css.includes(marker)) {
  css += cssPatch
  fs.writeFileSync(cssPath, css)
  console.log('Added collapsible desktop sidebar CSS.')
} else {
  console.log('Collapsible desktop sidebar CSS already exists.')
}

if (changed) {
  console.log('Patched src/components/Layout.tsx.')
}

console.log('Collapsible desktop sidebar patch completed.')
