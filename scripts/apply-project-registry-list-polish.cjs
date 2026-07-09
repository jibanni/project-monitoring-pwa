const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const projectsPath = path.join(projectRoot, 'src/pages/Projects.tsx')
const cssPath = path.join(projectRoot, 'src/styles/projects.css')

if (!fs.existsSync(projectsPath)) {
  console.error('Missing file: src/pages/Projects.tsx')
  process.exit(1)
}

if (!fs.existsSync(cssPath)) {
  console.error('Missing file: src/styles/projects.css')
  process.exit(1)
}

function backup(filePath) {
  const backupPath = `${filePath}.list-polish.bak`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath)
    console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`)
  }
}

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    console.warn(`Marker not found, skipped: ${label}`)
    return { source, changed: false }
  }

  console.log(`Patched: ${label}`)
  return {
    source: source.replace(search, replacement),
    changed: true,
  }
}

backup(projectsPath)
backup(cssPath)

let code = fs.readFileSync(projectsPath, 'utf8')
let changed = false

// Add copy helper.
if (!code.includes('function copySubayProjectCode')) {
  const marker = `function getRegistryRisk(project: ProjectRow) {
  return getPmsRiskLevel(project)
}
`
  const replacement = `${marker}
function copySubayProjectCode(event: React.MouseEvent<HTMLButtonElement>, code: string | null | undefined) {
  event.preventDefault()
  event.stopPropagation()

  const value = textValue(code)
  if (!value) return

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value)
  }
}
`
  const result = replaceOnce(code, marker, replacement, 'copySubayProjectCode helper')
  code = result.source
  changed = changed || result.changed
}

// Add CopyIcon component.
if (!code.includes('function CopyIcon()')) {
  const marker = `function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h14v3H5v-3Z" />
      <path d="M7 9h10v10.5H7V9Zm2 2v1.7h6V11H9Zm0 3.1v1.7h6v-1.7H9Z" />
      <path d="M12 2.75 15.25 6h-2v4h-2.5V6h-2L12 2.75Z" />
    </svg>
  )
}
`
  const replacement = `${marker}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5h6A2.5 2.5 0 0 1 19 7.5v8a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 8 15.5v-8Zm2.5-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-6Z" />
      <path d="M5 9.5A3.5 3.5 0 0 1 8.5 6H9v2h-.5A1.5 1.5 0 0 0 7 9.5v8A1.5 1.5 0 0 0 8.5 19H14v.5A2.5 2.5 0 0 1 11.5 22h-3A3.5 3.5 0 0 1 5 18.5v-9Z" />
    </svg>
  )
}
`
  const result = replaceOnce(code, marker, replacement, 'CopyIcon component')
  code = result.source
  changed = changed || result.changed
}

// Replace program line with program + Subay code row.
if (!code.includes('project-row-meta-line')) {
  const search = `                    <p className="project-row-program">{formatFundingDisplay(project)}</p>
                    <h3>{textValue(project.project_name) || 'Untitled Project'}</h3>`
  const replacement = `                    <div className="project-row-meta-line">
                      <p className="project-row-program">{formatFundingDisplay(project)}</p>

                      {textValue(project.subaybayan_project_code) && (
                        <button
                          type="button"
                          className="project-row-code"
                          onClick={(event) =>
                            copySubayProjectCode(event, project.subaybayan_project_code)
                          }
                          title="Copy SubayBAYAN project code"
                          aria-label="Copy SubayBAYAN project code"
                        >
                          <span>{textValue(project.subaybayan_project_code)}</span>
                          <CopyIcon />
                        </button>
                      )}
                    </div>

                    <h3>{textValue(project.project_name) || 'Untitled Project'}</h3>`
  const result = replaceOnce(code, search, replacement, 'SubayBAYAN project code copy chip')
  code = result.source
  changed = changed || result.changed
}

// Hide risk chip if risk is None.
if (!code.includes("getRiskClass(computedRisk) !== 'none' &&")) {
  const search = `                    <span className={\`project-risk \${getRiskClass(computedRisk)}\`}>
                      {computedRisk}
                    </span>`
  const replacement = `                    {getRiskClass(computedRisk) !== 'none' && (
                      <span className={\`project-risk \${getRiskClass(computedRisk)}\`}>
                        {computedRisk}
                      </span>
                    )}`
  const result = replaceOnce(code, search, replacement, 'hide No Risk chip')
  code = result.source
  changed = changed || result.changed
}

if (changed) {
  fs.writeFileSync(projectsPath, code)
  console.log('Updated src/pages/Projects.tsx')
} else {
  console.log('No TSX changes needed.')
}

// CSS polish.
let css = fs.readFileSync(cssPath, 'utf8')
const marker = 'PMS10 PROJECT REGISTRY LIST POLISH'

const oldIndex = css.indexOf(marker)
if (oldIndex >= 0) {
  const start = css.lastIndexOf('/*', oldIndex)
  const safeStart = start >= 0 ? start : oldIndex
  const next = css.indexOf('/* =========================', oldIndex + marker.length)
  css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
}

css += `
/* =========================
   PMS10 PROJECT REGISTRY LIST POLISH
   Desktop and mobile list-first Project Registry.
   Global header / hero behavior is untouched.
========================= */

.project-row-meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0 0 4px;
}

.project-row-meta-line .project-row-program {
  margin: 0;
  min-width: 0;
  flex: 0 1 auto;
}

.project-row-code {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 170px;
  min-height: 23px;
  border: 1px solid rgba(20, 93, 160, 0.16);
  border-radius: 999px;
  padding: 0 8px;
  background: #eff6ff;
  color: #0f4c81;
  font: inherit;
  font-size: 0.62rem;
  font-weight: 950;
  letter-spacing: 0.045em;
  line-height: 1;
  cursor: pointer;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}

.project-row-code span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-row-code svg {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
  fill: currentColor;
  opacity: 0.82;
}

.project-row-code:hover {
  background: #dbeafe;
}

.project-row-status-stack .project-risk.none {
  display: none !important;
}

@media (min-width: 901px) {
  .projects-compact-list-card {
    padding: 14px !important;
  }

  .project-list-row {
    grid-template-columns: minmax(0, 1.45fr) auto minmax(330px, 0.9fr) auto !important;
    min-height: 76px;
    padding: 11px 12px !important;
    border-radius: 18px !important;
    box-shadow: 0 7px 18px rgba(15, 48, 87, 0.05) !important;
  }

  .project-list-row h3 {
    font-size: 0.98rem !important;
    line-height: 1.16 !important;
  }

  .project-row-location {
    font-size: 0.76rem !important;
  }

  .project-row-status-stack .project-status,
  .project-row-status-stack .project-risk,
  .project-row-variance {
    min-height: 24px !important;
    padding: 0 8px !important;
    font-size: 0.61rem !important;
  }

  .project-row-metric {
    padding: 7px 8px !important;
    border-radius: 13px !important;
  }

  .project-row-action {
    min-height: 36px !important;
    min-width: 70px !important;
  }
}

@media (max-width: 700px) {
  .projects-compact-list-card {
    padding: 10px !important;
    border-radius: 20px !important;
  }

  .projects-compact-list {
    gap: 8px !important;
  }

  .project-list-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-areas:
      "main status"
      "metrics metrics"
      "actions actions" !important;
    gap: 8px !important;
    padding: 10px !important;
    border-left-width: 4px !important;
    border-radius: 16px !important;
    box-shadow: 0 6px 16px rgba(15, 48, 87, 0.05) !important;
  }

  .project-row-main {
    grid-area: main !important;
    min-width: 0 !important;
  }

  .project-row-status-stack {
    grid-area: status !important;
    align-self: start !important;
    justify-content: flex-end !important;
    min-width: 0 !important;
    max-width: 110px !important;
    gap: 4px !important;
  }

  .project-row-status-stack .project-status,
  .project-row-status-stack .project-risk,
  .project-row-variance {
    min-height: 22px !important;
    padding: 0 7px !important;
    font-size: 0.56rem !important;
    max-width: 108px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .project-row-meta-line {
    gap: 6px !important;
    margin-bottom: 4px !important;
  }

  .project-row-program {
    font-size: 0.57rem !important;
    letter-spacing: 0.1em !important;
  }

  .project-row-code {
    max-width: 96px !important;
    min-height: 21px !important;
    padding: 0 6px !important;
    font-size: 0.52rem !important;
  }

  .project-row-code svg {
    width: 11px !important;
    height: 11px !important;
    flex-basis: 11px !important;
  }

  .project-list-row h3 {
    font-size: 0.88rem !important;
    line-height: 1.16 !important;
    letter-spacing: -0.025em !important;
    -webkit-line-clamp: 2 !important;
    line-clamp: 2 !important;
  }

  .project-row-location {
    margin-top: 4px !important;
    font-size: 0.68rem !important;
    line-height: 1.16 !important;
  }

  .project-row-metrics {
    grid-area: metrics !important;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 5px !important;
  }

  .project-row-metric {
    min-width: 0 !important;
    padding: 6px !important;
    border-radius: 12px !important;
  }

  .project-row-metric span {
    font-size: 0.47rem !important;
    letter-spacing: 0.075em !important;
  }

  .project-row-metric strong {
    margin-top: 3px !important;
    font-size: 0.63rem !important;
  }

  .project-row-actions {
    grid-area: actions !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px !important;
  }

  .project-row-action {
    min-height: 36px !important;
    border-radius: 14px !important;
    font-size: 0.7rem !important;
  }

  .project-row-action svg {
    width: 14px !important;
    height: 14px !important;
    flex-basis: 14px !important;
  }
}

@media (max-width: 420px) {
  .project-list-row {
    grid-template-columns: 1fr !important;
    grid-template-areas:
      "main"
      "status"
      "metrics"
      "actions" !important;
  }

  .project-row-status-stack {
    justify-content: flex-start !important;
    max-width: none !important;
  }

  .project-row-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}
`

fs.writeFileSync(cssPath, css)
console.log('Updated src/styles/projects.css')
console.log('Project Registry list polish applied.')
