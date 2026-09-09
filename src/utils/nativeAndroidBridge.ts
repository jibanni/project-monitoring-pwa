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
