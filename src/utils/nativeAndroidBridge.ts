import { Capacitor } from '@capacitor/core'

const IS_NATIVE_ANDROID =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

function positionError(code: number, message: string): GeolocationPositionError {
  return { code, message } as GeolocationPositionError
}

function nativePositionToBrowserPosition(position: {
  timestamp: number
  coords: {
    latitude: number
    longitude: number
    accuracy: number
    altitude?: number | null
    altitudeAccuracy?: number | null
    heading?: number | null
    speed?: number | null
  }
}): GeolocationPosition {
  return {
    timestamp: position.timestamp,
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? null,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
      heading: position.coords.heading ?? null,
      speed: position.coords.speed ?? null,
      toJSON() {
        return {
          latitude: this.latitude,
          longitude: this.longitude,
          accuracy: this.accuracy,
          altitude: this.altitude,
          altitudeAccuracy: this.altitudeAccuracy,
          heading: this.heading,
          speed: this.speed,
        }
      },
    },
    toJSON() {
      return {
        timestamp: this.timestamp,
        coords: this.coords.toJSON(),
      }
    },
  } as GeolocationPosition
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? '')
}

function permissionLike(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('permission') ||
    normalized.includes('denied') ||
    normalized.includes('not allowed')
  )
}

function installNativeGpsBridge() {
  if (!IS_NATIVE_ANDROID || !navigator.geolocation) return

  const geolocation = navigator.geolocation
  const browserGetCurrentPosition =
    geolocation.getCurrentPosition.bind(geolocation)

  const nativeGetCurrentPosition: Geolocation['getCurrentPosition'] = (
    success,
    failure,
    options,
  ) => {
    void (async () => {
      try {
        const { Geolocation } = await import('@capacitor/geolocation')

        let permissions = await Geolocation.checkPermissions()
        if (permissions.location !== 'granted') {
          permissions = await Geolocation.requestPermissions({
            permissions: ['location'],
          })
        }

        if (permissions.location !== 'granted') {
          failure?.(
            positionError(
              1,
              'Location permission is disabled for PMS10. Open Android Settings > Apps > PMS10 > Permissions > Location and choose Allow while using the app.',
            ),
          )
          return
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: options?.enableHighAccuracy ?? true,
          timeout: options?.timeout ?? 20000,
          maximumAge: options?.maximumAge ?? 0,
        })

        success(nativePositionToBrowserPosition(position))
      } catch (error) {
        const message = errorMessage(error)

        if (permissionLike(message)) {
          failure?.(
            positionError(
              1,
              'Location permission is disabled for PMS10. Open Android Settings > Apps > PMS10 > Permissions > Location and choose Allow while using the app.',
            ),
          )
          return
        }

        if (message.toLowerCase().includes('timeout')) {
          failure?.(
            positionError(
              3,
              'GPS capture timed out. Move to an open area and try Update GPS again.',
            ),
          )
          return
        }

        try {
          browserGetCurrentPosition(success, failure, options)
        } catch {
          failure?.(
            positionError(
              2,
              message || 'Unable to capture the device location.',
            ),
          )
        }
      }
    })()
  }

  try {
    Object.defineProperty(geolocation, 'getCurrentPosition', {
      configurable: true,
      value: nativeGetCurrentPosition,
    })
  } catch {
    try {
      ;(geolocation as Geolocation & {
        getCurrentPosition: Geolocation['getCurrentPosition']
      }).getCurrentPosition = nativeGetCurrentPosition
    } catch (error) {
      console.warn('[PMS10 Android] Unable to install native GPS bridge.', error)
    }
  }
}

function findImageInput(event: Event): HTMLInputElement | null {
  const path =
    typeof event.composedPath === 'function' ? event.composedPath() : []

  for (const entry of path) {
    if (
      entry instanceof HTMLInputElement &&
      entry.type === 'file' &&
      (entry.accept.toLowerCase().includes('image') ||
        entry.hasAttribute('capture'))
    ) {
      return entry
    }
  }

  const target = event.target
  if (
    target instanceof HTMLInputElement &&
    target.type === 'file' &&
    (target.accept.toLowerCase().includes('image') ||
      target.hasAttribute('capture'))
  ) {
    return target
  }

  return null
}

function cancelled(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('cancel') ||
    normalized.includes('canceled') ||
    normalized.includes('cancelled')
  )
}

async function nativePhotoToFile(photo: {
  webPath?: string
  format?: string
}) {
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
  const type =
    blob.type || (extension === 'jpg' ? 'image/jpeg' : `image/${extension}`)

  return new File(
    [blob],
    `pms10-field-photo-${Date.now()}.${extension}`,
    {
      type,
      lastModified: Date.now(),
    },
  )
}

function putFileIntoExistingInput(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer()
  transfer.items.add(file)

  try {
    input.files = transfer.files
  } catch {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: transfer.files,
    })
  }

  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function installNativePhotoBridge() {
  if (!IS_NATIVE_ANDROID) return

  const activeInputs = new WeakSet<HTMLInputElement>()

  document.addEventListener(
    'click',
    (event) => {
      const input = findImageInput(event)
      if (!input || input.disabled || activeInputs.has(input)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      activeInputs.add(input)

      void (async () => {
        try {
          const { Camera, CameraResultType, CameraSource } = await import(
            '@capacitor/camera'
          )

          const photo = await Camera.getPhoto({
            quality: 82,
            allowEditing: false,
            correctOrientation: true,
            resultType: CameraResultType.Uri,
            source: CameraSource.Prompt,
            saveToGallery: false,
          })

          const file = await nativePhotoToFile(photo)
          putFileIntoExistingInput(input, file)
        } catch (error) {
          const message = errorMessage(error)
          if (cancelled(message)) return

          window.alert(
            permissionLike(message)
              ? 'Camera/photo permission is disabled for PMS10. Open Android Settings > Apps > PMS10 > Permissions and allow Camera/Photos, then try again.'
              : message ||
                  'Unable to open the Android camera/photo picker. Please try again.',
          )
          console.error('[PMS10 Android] Native photo picker failed.', error)
        } finally {
          activeInputs.delete(input)
        }
      })()
    },
    true,
  )
}

if (IS_NATIVE_ANDROID) {
  installNativeGpsBridge()
  installNativePhotoBridge()
}


/*
 * Android Aide Memoire viewer bridge
 * -----------------------------------
 * The browser/PWA PDF route uses an embedded Blob preview. Android System
 * WebView can show that route as a blank white page even though the PDF has
 * already been generated and stored in Dexie.
 *
 * Keep the existing route/UI intact, but on Android:
 *  - automatically open the stored PDF in the native document viewer;
 *  - make the existing "Share / Save" button share the stored PDF through
 *    Android's native share sheet;
 *  - retrieve the exact generated PDF from aide_memoire_documents using the
 *    documentId query parameter already used by the route.
 */
let lastNativeAideViewerDocumentId = ''
let nativeAideViewerOpening = false
let nativeAideShareBusy = false

function currentAideMemoireViewerDocumentId() {
  if (!IS_NATIVE_ANDROID) return ''

  const path = window.location.pathname.toLowerCase()
  if (!path.includes('/aide-memoire/pdf')) return ''

  const params = new URLSearchParams(window.location.search)
  return String(params.get('documentId') || '').trim()
}

async function loadCurrentAideMemoireViewerFile() {
  const documentId = currentAideMemoireViewerDocumentId()
  if (!documentId) {
    throw new Error(
      'PMS10 could not identify the generated Aide Memoire PDF.',
    )
  }

  const { offlineDb, aideMemoireDocumentToBlob } = await import(
    '../lib/offlineDb'
  )

  const record = await offlineDb.aide_memoire_documents.get(documentId)

  if (!record) {
    throw new Error(
      'The generated Aide Memoire PDF is not available on this device.',
    )
  }

  const blob = aideMemoireDocumentToBlob(record)

  if (blob.size <= 0) {
    throw new Error(
      'The generated Aide Memoire PDF is empty. Please generate it again.',
    )
  }

  return {
    documentId,
    file: {
      fileName: record.file_name || 'Aide_Memoire.pdf',
      blob,
    },
  }
}

async function openCurrentAideMemoireViewerNatively() {
  if (!IS_NATIVE_ANDROID || nativeAideViewerOpening) return

  const documentId = currentAideMemoireViewerDocumentId()
  if (!documentId || documentId === lastNativeAideViewerDocumentId) return

  nativeAideViewerOpening = true
  lastNativeAideViewerDocumentId = documentId

  try {
    const { file } = await loadCurrentAideMemoireViewerFile()
    const { openGeneratedFileOnAndroid } = await import(
      './nativeGeneratedFileDelivery'
    )

    await openGeneratedFileOnAndroid(file)
  } catch (error) {
    console.warn(
      '[PMS10 Android] Native Aide Memoire preview could not open.',
      error,
    )

    // Allow one retry when the user returns to/re-enters the viewer route.
    lastNativeAideViewerDocumentId = ''
  } finally {
    nativeAideViewerOpening = false
  }
}

async function shareCurrentAideMemoireViewerNatively() {
  if (!IS_NATIVE_ANDROID || nativeAideShareBusy) return

  nativeAideShareBusy = true

  try {
    const { file } = await loadCurrentAideMemoireViewerFile()
    const { shareGeneratedFilesOnAndroid } = await import(
      './nativeGeneratedFileDelivery'
    )

    await shareGeneratedFilesOnAndroid([file])
  } catch (error) {
    console.error(
      '[PMS10 Android] Unable to share/save the Aide Memoire PDF.',
      error,
    )

    const message =
      error instanceof Error
        ? error.message
        : 'Unable to share or save the generated Aide Memoire PDF.'

    window.alert(message)
  } finally {
    nativeAideShareBusy = false
  }
}

function isShareSaveControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  const control = target.closest(
    'button, a, [role="button"]',
  ) as HTMLElement | null

  if (!control) return false

  const label = String(
    control.innerText ||
      control.textContent ||
      control.getAttribute('aria-label') ||
      '',
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  return (
    label === 'share / save' ||
    label === 'share/save' ||
    label.includes('share / save')
  )
}

function installNativeAideMemoireViewerBridge() {
  if (!IS_NATIVE_ANDROID) return

  document.addEventListener(
    'click',
    (event) => {
      if (!currentAideMemoireViewerDocumentId()) return
      if (!isShareSaveControl(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      void shareCurrentAideMemoireViewerNatively()
    },
    true,
  )

  const checkViewerRoute = () => {
    if (!currentAideMemoireViewerDocumentId()) {
      lastNativeAideViewerDocumentId = ''
      return
    }

    window.setTimeout(() => {
      void openCurrentAideMemoireViewerNatively()
    }, 250)
  }

  // BrowserRouter route changes mutate the rendered DOM without reloading the
  // page. A MutationObserver catches those route renders without modifying the
  // router or ProjectUpdates.tsx.
  const observer = new MutationObserver(checkViewerRoute)

  const startObserver = () => {
    if (!document.body) {
      window.setTimeout(startObserver, 50)
      return
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    checkViewerRoute()
  }

  startObserver()
}

if (IS_NATIVE_ANDROID) {
  installNativeAideMemoireViewerBridge()
}
