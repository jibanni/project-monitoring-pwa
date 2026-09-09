import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const TARGET = path.join(ROOT, 'src', 'pages', 'ProjectUpdates.tsx')
const GOOD_COMMIT = '4671c8dc0e90f9a8daca34cb77f16d3fd88dc7af'
const GIT_PATH = 'src/pages/ProjectUpdates.tsx'

function fail(message) {
  console.error(`\n[PMS10] ${message}\n`)
  process.exit(1)
}

function gitShow(spec) {
  try {
    return execFileSync('git', ['show', spec], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    })
  } catch (error) {
    fail(
      `Could not read ${spec} from local Git history. Make sure you are in ~/project-monitoring-pwa and run git fetch origin first.\n${String(
        error?.message || error
      )}`
    )
  }
}

function findFunctionRange(source, functionName) {
  const patterns = [
    `async function ${functionName}(`,
    `function ${functionName}(`,
  ]

  let start = -1
  for (const pattern of patterns) {
    start = source.indexOf(pattern)
    if (start >= 0) break
  }

  if (start < 0) {
    fail(`Could not find function ${functionName}() in the restored ProjectUpdates.tsx.`)
  }

  const openBrace = source.indexOf('{', start)
  if (openBrace < 0) fail(`Could not parse function ${functionName}().`)

  let depth = 0
  let quote = null
  let escape = false
  let templateDepth = 0

  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i]
    const prev = source[i - 1]

    if (escape) {
      escape = false
      continue
    }

    if (quote) {
      if (ch === '\\') {
        escape = true
        continue
      }

      if (quote === '`') {
        if (ch === '`' && templateDepth === 0) {
          quote = null
        } else if (ch === '$' && source[i + 1] === '{') {
          templateDepth += 1
          i += 1
        } else if (ch === '}' && templateDepth > 0) {
          templateDepth -= 1
        }
        continue
      }

      if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      templateDepth = 0
      continue
    }

    if (ch === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i + 2)
      i = newline < 0 ? source.length : newline
      continue
    }

    if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2)
      i = close < 0 ? source.length : close + 1
      continue
    }

    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return { start, end: i + 1 }
      }
    }
  }

  fail(`Could not find the end of function ${functionName}().`)
}

function insertAfterFunction(source, functionName, addition) {
  const range = findFunctionRange(source, functionName)
  return (
    source.slice(0, range.end) +
    '\n\n' +
    addition.trim() +
    source.slice(range.end)
  )
}

function replaceFunction(source, functionName, replacement) {
  const range = findFunctionRange(source, functionName)
  return source.slice(0, range.start) + replacement.trim() + source.slice(range.end)
}

function injectNativePhotoClicks(source) {
  let cursor = 0
  let result = ''
  let changed = 0

  while (true) {
    const start = source.indexOf('<input', cursor)
    if (start < 0) {
      result += source.slice(cursor)
      break
    }

    result += source.slice(cursor, start)

    const end = source.indexOf('/>', start)
    if (end < 0) {
      result += source.slice(start)
      break
    }

    let tag = source.slice(start, end + 2)

    const isImageFileInput =
      /type\s*=\s*["']file["']/.test(tag) &&
      /accept\s*=/.test(tag) &&
      /image/i.test(tag)

    if (
      isImageFileInput &&
      !tag.includes('handleNativePhotoCapture') &&
      !tag.includes('data-pms10-native-photo')
    ) {
      const marker = `
                  data-pms10-native-photo
                  onClick={(event) => {
                    if (Capacitor.isNativePlatform()) {
                      event.preventDefault()
                      void handleNativePhotoCapture()
                    }
                  }}
`
      const onChangeIndex = tag.indexOf('onChange=')

      if (onChangeIndex >= 0) {
        tag = tag.slice(0, onChangeIndex) + marker + tag.slice(onChangeIndex)
      } else {
        tag = tag.slice(0, -2) + marker + '                />'
      }

      changed += 1
    }

    result += tag
    cursor = end + 2
  }

  if (changed === 0) {
    console.warn(
      '[PMS10] Warning: no image file inputs were patched. The restored UI may use a different photo control.'
    )
  } else {
    console.log(`[PMS10] Native Camera/Photos attached to ${changed} existing PWA photo input(s).`)
  }

  return result
}

if (!fs.existsSync(path.join(ROOT, 'package.json'))) {
  fail('Run this script from the PMS10 project root.')
}

if (!fs.existsSync(TARGET)) {
  fail(`${GIT_PATH} does not exist.`)
}

// IMPORTANT:
// 4671c8d is the last known production revision before the Android-native
// patch replaced ProjectUpdates.tsx with the older, non-stepper layout.
let source = gitShow(`${GOOD_COMMIT}:${GIT_PATH}`)

if (source.length < 10000) {
  fail('The restored ProjectUpdates.tsx looks unexpectedly small. No file was changed.')
}

// Add Capacitor imports while leaving the restored PWA JSX/layout intact.
if (!source.includes("from '@capacitor/core'")) {
  const anchor = "import { createPortal } from 'react-dom'\n"
  if (!source.includes(anchor)) {
    fail('Could not locate the React import section in the restored file.')
  }

  source = source.replace(
    anchor,
    `${anchor}import { Capacitor } from '@capacitor/core'\nimport { Camera, CameraResultType, CameraSource } from '@capacitor/camera'\nimport { Geolocation } from '@capacitor/geolocation'\n`
  )
}

// Add Android helper functions after the existing browser GPS helper.
if (!source.includes('function getNativePermissionMessage()')) {
  const helpers = `
function getNativePermissionMessage() {
  return 'Location permission is disabled for PMS10. Open Android Settings > Apps > PMS10 > Permissions > Location and choose Allow while using the app, then tap Update GPS again.'
}

async function capacitorPhotoToFile(photo: { webPath?: string; format?: string }) {
  if (!photo.webPath) {
    throw new Error('The selected photo could not be read by PMS10.')
  }

  const response = await fetch(photo.webPath)
  if (!response.ok) {
    throw new Error('The selected photo could not be loaded by PMS10.')
  }

  const blob = await response.blob()
  const rawFormat = String(photo.format || '').toLowerCase()
  const extension = rawFormat === 'jpeg' ? 'jpg' : rawFormat || 'jpg'
  const mimeType =
    blob.type || (extension === 'jpg' ? 'image/jpeg' : \`image/\${extension}\`)

  return new File(
    [blob],
    \`pms10-field-photo-\${Date.now()}.\${extension}\`,
    {
      type: mimeType,
      lastModified: Date.now(),
    }
  )
}
`
  source = insertAfterFunction(source, 'getGpsErrorMessage', helpers)
}

// Add only native loading state; no PWA layout state is replaced.
if (!source.includes('nativePhotoLoading')) {
  const statePatterns = [
    /(\s+const \[photoInputs,\s*setPhotoInputs\]\s*=\s*useState<PhotoInput\[\]>\(\[\]\)\s*\n)/,
    /(\s+const \[photoInputs,\s*setPhotoInputs\]\s*=\s*useState\(\[\]\)\s*\n)/,
  ]

  let inserted = false
  for (const pattern of statePatterns) {
    if (pattern.test(source)) {
      source = source.replace(
        pattern,
        `$1  const [nativePhotoLoading, setNativePhotoLoading] = useState(false)\n`
      )
      inserted = true
      break
    }
  }

  if (!inserted) {
    fail('Could not find the photoInputs state in the restored Step 1–8 page.')
  }
}

// Keep the PWA's existing photo UI. Add an Android-native handler beside its
// existing handlePhotoSelect function.
if (!source.includes('async function handleNativePhotoCapture()')) {
  const nativePhotoHandler = `
  async function handleNativePhotoCapture() {
    if (!Capacitor.isNativePlatform()) return

    if (photoInputs.length >= MAX_PHOTOS_PER_UPDATE) {
      setErrorMessage(
        \`Only \${MAX_PHOTOS_PER_UPDATE} photos are allowed per update.\`
      )
      return
    }

    setNativePhotoLoading(true)
    setErrorMessage('')

    try {
      const photo = await Camera.getPhoto({
        quality: 82,
        allowEditing: false,
        correctOrientation: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        saveToGallery: false,
      })

      const file = await capacitorPhotoToFile(photo)

      setPhotoInputs((previous) => [
        ...previous,
        {
          id: makeLocalId(),
          file,
          previewUrl: URL.createObjectURL(file),
          caption: '',
        },
      ])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || '')
      const normalized = message.toLowerCase()

      if (
        normalized.includes('cancel') ||
        normalized.includes('user cancelled') ||
        normalized.includes('user canceled')
      ) {
        return
      }

      console.error(error)
      setErrorMessage(
        normalized.includes('permission')
          ? 'Camera/photo permission is disabled for PMS10. Open Android Settings > Apps > PMS10 > Permissions, allow Camera/Photos, then try again.'
          : message ||
              'Unable to open the camera/photo picker. Please try again.'
      )
    } finally {
      setNativePhotoLoading(false)
    }
  }
`
  source = insertAfterFunction(source, 'handlePhotoSelect', nativePhotoHandler)
}

// Replace GPS implementation only. The restored PWA fields/stepper/JSX remain
// untouched; browser PWA still uses navigator.geolocation.
const nativeGps = `
  async function captureGps() {
    setGpsMessage('')
    setErrorMessage('')
    setGpsLoading(true)

    const applyPosition = (
      latitude: number,
      longitude: number,
      accuracy?: number | null
    ) => {
      if (!isMindanaoCoordinate(latitude, longitude)) {
        setErrorMessage(
          'Captured GPS is outside the Mindanao range. Please verify your device location or manually encode the correct project coordinates.'
        )
        return false
      }

      setInspectionLatitude(latitude.toFixed(7))
      setInspectionLongitude(longitude.toFixed(7))
      setGpsMessage(
        \`GPS updated successfully\${
          Number.isFinite(Number(accuracy))
            ? \` with approximately \${Math.round(Number(accuracy))}m accuracy\`
            : ''
        }.\`
      )
      setErrorMessage('')
      return true
    }

    try {
      if (Capacitor.isNativePlatform()) {
        let permissions = await Geolocation.checkPermissions()

        if (permissions.location !== 'granted') {
          permissions = await Geolocation.requestPermissions({
            permissions: ['location'],
          })
        }

        if (permissions.location !== 'granted') {
          setErrorMessage(getNativePermissionMessage())
          return
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        })

        applyPosition(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        )
        return
      }

      if (!navigator.geolocation) {
        setErrorMessage('GPS is not supported by this browser or device.')
        return
      }

      if (!window.isSecureContext) {
        setErrorMessage(
          'GPS requires HTTPS or localhost. Please open the app using localhost, HTTPS deployment, or manually encode the coordinates.'
        )
        return
      }

      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            applyPosition(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy
            )
            resolve()
          },
          (error) => {
            console.error(error)
            setErrorMessage(getGpsErrorMessage(error))
            resolve()
          },
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          }
        )
      })
    } catch (error) {
      console.error(error)
      const message =
        error instanceof Error ? error.message : String(error || '')
      const normalized = message.toLowerCase()

      if (
        normalized.includes('permission') ||
        normalized.includes('denied')
      ) {
        setErrorMessage(getNativePermissionMessage())
      } else if (normalized.includes('timeout')) {
        setErrorMessage(
          'GPS capture timed out. Move to an open area and try Update GPS again.'
        )
      } else {
        setErrorMessage(
          message ||
            'Unable to capture GPS. Please verify that device Location is turned on and try again.'
        )
      }
    } finally {
      setGpsLoading(false)
    }
  }
`

source = replaceFunction(source, 'captureGps', nativeGps)

// Preserve the exact restored photo controls visually. Only intercept image
// file-input clicks when running inside Capacitor Android.
source = injectNativePhotoClicks(source)

fs.writeFileSync(TARGET, source, 'utf8')

console.log('')
console.log('PMS10 Project Update repair completed.')
console.log(`Restored UI source: ${GOOD_COMMIT.slice(0, 7)} (${GIT_PATH})`)
console.log('Kept/restored: current Step 1–8 mobile Project Update workflow')
console.log('Merged: Android-native Geolocation')
console.log('Merged: Android-native Camera/Photo picker')
console.log('Web/PWA JSX/layout was not replaced with an Android-specific UI.')
console.log('')
console.log('Now run:')
console.log('  python3 scripts/pms10_add_android_permissions.py')
console.log('  npm run build')
console.log('')
console.log('Do not build the APK until npm run build succeeds.')
