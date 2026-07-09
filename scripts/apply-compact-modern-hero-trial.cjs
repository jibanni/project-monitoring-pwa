const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const dashboardCssPath = path.join(projectRoot, 'src/styles/dashboard.css')
const projectsCssPath = path.join(projectRoot, 'src/styles/projects.css')

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${path.relative(projectRoot, filePath)}`)
    process.exit(1)
  }
}

function backup(filePath, suffix) {
  const backupPath = `${filePath}.${suffix}.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function appendOrReplace(filePath, marker, cssBlock) {
  let css = fs.readFileSync(filePath, 'utf8')

  const oldIndex = css.indexOf(marker)
  if (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)
    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  }

  css += cssBlock
  fs.writeFileSync(filePath, css)
  console.log(`Updated ${path.relative(projectRoot, filePath)}`)
}

requireFile(dashboardCssPath)
requireFile(projectsCssPath)

backup(dashboardCssPath, 'compact-modern-hero')
backup(projectsCssPath, 'compact-modern-hero')

const dashboardCss = `
/* =========================
   PMS10 COMPACT MODERN HERO TRIAL - DASHBOARD
   Keeps original hero merge behavior. Only adjusts size/spacing/typography.
========================= */

@media (min-width: 901px) {
  .dashboard-hero {
    min-height: 174px !important;
    padding: 28px 32px !important;
    border-radius: 28px !important;
  }

  .dashboard-hero h1 {
    max-width: 880px !important;
    font-size: clamp(2.4rem, 4vw, 4rem) !important;
    line-height: 0.98 !important;
    letter-spacing: -0.045em !important;
  }

  .dashboard-hero p:not(.dashboard-eyebrow) {
    max-width: 860px !important;
    margin-top: 12px !important;
    font-size: 0.98rem !important;
    line-height: 1.5 !important;
  }

  .dashboard-eyebrow {
    margin-bottom: 10px !important;
    font-size: 0.74rem !important;
    letter-spacing: 0.18em !important;
  }

  .dashboard-page.is-dashboard-scrolled .dashboard-hero {
    min-height: var(--app-header-live-h, 84px) !important;
  }
}

@media (max-width: 700px) {
  .dashboard-hero {
    min-height: 218px !important;
    padding: 28px 34px 30px !important;
    border-radius: 26px !important;
  }

  .dashboard-eyebrow {
    margin-bottom: 10px !important;
    font-size: 0.66rem !important;
    letter-spacing: 0.2em !important;
  }

  .dashboard-hero h1 {
    font-size: clamp(2.35rem, 12vw, 3.35rem) !important;
    line-height: 0.98 !important;
    letter-spacing: -0.055em !important;
  }

  .dashboard-hero p:not(.dashboard-eyebrow) {
    margin-top: 14px !important;
    max-width: 100% !important;
    font-size: 0.94rem !important;
    line-height: 1.45 !important;
  }

  .dashboard-page.is-dashboard-scrolled .dashboard-hero h1 {
    font-size: 1.25rem !important;
    letter-spacing: -0.03em !important;
  }
}

@media (max-width: 420px) {
  .dashboard-hero {
    min-height: 202px !important;
    padding: 24px 28px 26px !important;
    border-radius: 24px !important;
  }

  .dashboard-hero h1 {
    font-size: clamp(2rem, 11vw, 2.85rem) !important;
  }

  .dashboard-hero p:not(.dashboard-eyebrow) {
    font-size: 0.86rem !important;
  }
}
`

const projectsCss = `
/* =========================
   PMS10 COMPACT MODERN HERO TRIAL - PROJECT REGISTRY
   Keeps original hero merge behavior. Only adjusts size/spacing/typography.
========================= */

@media (min-width: 901px) {
  .projects-hero,
  .projects-registry-hero {
    min-height: 166px !important;
    padding: 28px 32px !important;
    border-radius: 28px !important;
  }

  .projects-hero h1,
  .projects-registry-hero h1 {
    max-width: 880px !important;
    font-size: clamp(2.3rem, 4vw, 3.85rem) !important;
    line-height: 0.98 !important;
    letter-spacing: -0.045em !important;
  }

  .projects-hero p,
  .projects-registry-hero p {
    max-width: 860px !important;
    margin-top: 12px !important;
    font-size: 0.98rem !important;
    line-height: 1.5 !important;
  }

  .projects-eyebrow {
    margin-bottom: 10px !important;
    font-size: 0.74rem !important;
    letter-spacing: 0.18em !important;
  }
}

@media (max-width: 700px) {
  .projects-hero,
  .projects-registry-hero {
    min-height: 190px !important;
    padding: 26px 34px 28px !important;
    border-radius: 26px !important;
  }

  .projects-eyebrow {
    margin-bottom: 10px !important;
    font-size: 0.66rem !important;
    letter-spacing: 0.2em !important;
  }

  .projects-hero h1,
  .projects-registry-hero h1 {
    font-size: clamp(2.25rem, 12vw, 3.2rem) !important;
    line-height: 0.98 !important;
    letter-spacing: -0.055em !important;
  }

  .projects-hero p,
  .projects-registry-hero p {
    margin-top: 14px !important;
    max-width: 100% !important;
    font-size: 0.9rem !important;
    line-height: 1.42 !important;
  }

  .projects-page.is-registry-scrolled .projects-hero h1,
  .projects-page.is-registry-scrolled .projects-registry-hero h1 {
    font-size: 1.25rem !important;
    letter-spacing: -0.03em !important;
  }
}

@media (max-width: 420px) {
  .projects-hero,
  .projects-registry-hero {
    min-height: 178px !important;
    padding: 23px 28px 25px !important;
    border-radius: 24px !important;
  }

  .projects-hero h1,
  .projects-registry-hero h1 {
    font-size: clamp(2rem, 11vw, 2.85rem) !important;
  }

  .projects-hero p,
  .projects-registry-hero p {
    font-size: 0.84rem !important;
  }
}
`

appendOrReplace(
  dashboardCssPath,
  'PMS10 COMPACT MODERN HERO TRIAL - DASHBOARD',
  dashboardCss,
)

appendOrReplace(
  projectsCssPath,
  'PMS10 COMPACT MODERN HERO TRIAL - PROJECT REGISTRY',
  projectsCss,
)

console.log('Compact modern hero trial applied.')
console.log('No Layout.tsx/global header changes were made.')
