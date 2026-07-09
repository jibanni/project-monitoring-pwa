const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const layoutPath = path.join(projectRoot, 'src/components/Layout.tsx')
const layoutCssPath = path.join(projectRoot, 'src/styles/layout.css')

if (!fs.existsSync(layoutPath)) {
  console.error('Missing file: src/components/Layout.tsx')
  process.exit(1)
}

let layout = fs.readFileSync(layoutPath, 'utf8')
let changed = false

function removeBlockByClass(source, className) {
  const classIndex = source.indexOf(className)
  if (classIndex < 0) return source

  const tagStart = source.lastIndexOf('<', classIndex)
  if (tagStart < 0) return source

  const tagMatch = source.slice(tagStart, classIndex).match(/<([A-Za-z0-9.]+)/)
  if (!tagMatch) return source

  const tagName = tagMatch[1].replace(/\./g, '\\.')
  const closeTag = `</${tagMatch[1]}>`
  const closeIndex = source.indexOf(closeTag, classIndex)

  if (closeIndex < 0) return source

  const end = closeIndex + closeTag.length
  changed = true
  console.log(`Removed element with class: ${className}`)

  return source.slice(0, tagStart) + source.slice(end)
}

function removeUseStateBlock(source) {
  const marker = 'const [desktopSidebarCollapsed'
  const index = source.indexOf(marker)
  if (index < 0) return source

  const start = source.lastIndexOf('\n', index) + 1
  const endMarker = '  })\n\n'
  const end = source.indexOf(endMarker, index)

  if (end < 0) return source

  changed = true
  console.log('Removed desktopSidebarCollapsed state.')

  return source.slice(0, start) + source.slice(end + endMarker.length)
}

function removeLocalStorageEffect(source) {
  const marker = "pms10-desktop-sidebar-collapsed"
  const index = source.indexOf(marker)

  if (index < 0) return source

  const useEffectStart = source.lastIndexOf('  useEffect(() => {', index)
  const endMarker = '  }, [desktopSidebarCollapsed])\n\n'
  const end = source.indexOf(endMarker, index)

  if (useEffectStart < 0 || end < 0) return source

  changed = true
  console.log('Removed desktop sidebar localStorage effect.')

  return source.slice(0, useEffectStart) + source.slice(end + endMarker.length)
}

// 1. Remove the injected sidebar hamburger button and trademark block.
layout = removeBlockByClass(layout, 'app-sidebar-toggle')
layout = removeBlockByClass(layout, 'app-sidebar-trademark')

// 2. Remove collapsed state/effect introduced by sidebar experiments.
layout = removeLocalStorageEffect(layout)
layout = removeUseStateBlock(layout)

// 3. Remove injected collapsed class from shell/header class arrays.
layout = layout.replace(
  /\n\s*desktopSidebarCollapsed \? 'app-sidebar-collapsed' : '',/g,
  () => {
    changed = true
    console.log('Removed app-sidebar-collapsed class reference.')
    return ''
  },
)

// 4. Remove any remaining references to desktopSidebarCollapsed in aria/title fragments if present.
layout = layout.replace(/desktopSidebarCollapsed \? [^:\n]+ : [^\n]+/g, () => {
  changed = true
  console.log('Removed stray desktopSidebarCollapsed expression.')
  return "''"
})

fs.writeFileSync(layoutPath, layout)

// 5. Add defensive CSS to hide any leftover sidebar artifact classes if one remains from cache/markup.
if (fs.existsSync(layoutCssPath)) {
  let css = fs.readFileSync(layoutCssPath, 'utf8')
  const marker = 'PMS10 REMOVE SIDEBAR ARTIFACTS FIX'

  const oldIndex = css.indexOf(marker)
  if (oldIndex >= 0) {
    const start = css.lastIndexOf('/*', oldIndex)
    const safeStart = start >= 0 ? start : oldIndex
    const next = css.indexOf('/* =========================', oldIndex + marker.length)
    css = next >= 0 ? css.slice(0, safeStart) + css.slice(next) : css.slice(0, safeStart)
  }

  css += `
/* =========================
   PMS10 REMOVE SIDEBAR ARTIFACTS FIX
   Removes sidebar experiment leftovers while keeping original hero/header merge.
========================= */

@media (min-width: 901px) {
  .app-sidebar-toggle,
  .app-sidebar-trademark {
    display: none !important;
  }

  .app-shell.app-sidebar-collapsed {
    padding-left: inherit;
  }
}
`

  fs.writeFileSync(layoutCssPath, css)
  console.log('Added defensive CSS for sidebar artifacts.')
}

if (changed) {
  console.log('Sidebar artifact cleanup applied.')
} else {
  console.log('No sidebar artifact changes were needed.')
}

console.log('Next: npm run build && npm run dev -- --host 0.0.0.0')
