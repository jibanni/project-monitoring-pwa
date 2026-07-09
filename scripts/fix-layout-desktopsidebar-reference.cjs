const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'src/components/Layout.tsx')

if (!fs.existsSync(filePath)) {
  console.error('Missing file: src/components/Layout.tsx')
  process.exit(1)
}

let code = fs.readFileSync(filePath, 'utf8')
let changed = false

function removeUseEffectWithDesktopSidebarDependency(source) {
  const dependency = '[desktopSidebarCollapsed]'
  let output = source
  let dependencyIndex = output.indexOf(dependency)

  while (dependencyIndex >= 0) {
    const effectStart = output.lastIndexOf('  useEffect(() => {', dependencyIndex)

    if (effectStart < 0) {
      console.warn('Found desktopSidebarCollapsed dependency but could not find useEffect start.')
      break
    }

    let effectEnd = output.indexOf('\n\n', dependencyIndex)

    if (effectEnd < 0) {
      effectEnd = output.indexOf('\n  const ', dependencyIndex)
    }

    if (effectEnd < 0) {
      effectEnd = output.indexOf('\n  function ', dependencyIndex)
    }

    if (effectEnd < 0) {
      effectEnd = output.indexOf('\n  return ', dependencyIndex)
    }

    if (effectEnd < 0) {
      effectEnd = output.length
    }

    const removed = output.slice(effectStart, effectEnd)
    output = output.slice(0, effectStart) + output.slice(effectEnd)

    changed = true
    console.log('Removed leftover useEffect depending on desktopSidebarCollapsed.')
    dependencyIndex = output.indexOf(dependency)
  }

  return output
}

code = removeUseEffectWithDesktopSidebarDependency(code)

// Extra safety: remove any remaining line references if no full effect block remains.
const beforeLineCleanup = code
code = code
  .replace(/^\s*}, \[desktopSidebarCollapsed\]\)\s*\n/gm, '')
  .replace(/^\s*desktopSidebarCollapsed \? 'app-sidebar-collapsed' : '',\s*\n/gm, '')

if (code !== beforeLineCleanup) {
  changed = true
  console.log('Removed leftover desktopSidebarCollapsed lines.')
}

// If the state was not removed by the prior artifact cleanup, remove it now.
const stateMarker = 'const [desktopSidebarCollapsed'
const stateIndex = code.indexOf(stateMarker)

if (stateIndex >= 0) {
  const start = code.lastIndexOf('\n', stateIndex) + 1
  const endMarker = '  })\n\n'
  const end = code.indexOf(endMarker, stateIndex)

  if (end >= 0) {
    code = code.slice(0, start) + code.slice(end + endMarker.length)
    changed = true
    console.log('Removed leftover desktopSidebarCollapsed state.')
  }
}

fs.writeFileSync(filePath, code)

if (changed) {
  console.log('Layout desktopSidebarCollapsed reference fix applied.')
} else {
  console.log('No desktopSidebarCollapsed references found.')
}
