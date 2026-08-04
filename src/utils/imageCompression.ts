export type InspectionImageCompressionResult = {
  file: File
  originalSize: number
  compressedSize: number
  compressed: boolean
  width: number
  height: number
}

type CompressionOptions = {
  maxDimension?: number
  targetMaxBytes?: number
  initialQuality?: number
  minimumQuality?: number
}

function replaceExtensionWithJpeg(fileName: string) {
  const base = fileName.replace(/\.[^/.]+$/, '').trim() || 'inspection-photo'
  return `${base}.jpg`
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('The browser could not compress this photo.'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
          context.drawImage(bitmap, 0, 0, width, height)
        },
        close: () => bitmap.close(),
      }
    } catch {
      // Safari and older Android browsers can reject the optional orientation flag.
      try {
        const bitmap = await createImageBitmap(file)
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
            context.drawImage(bitmap, 0, 0, width, height)
          },
          close: () => bitmap.close(),
        }
      } catch {
        // Continue to the HTMLImageElement fallback.
      }
    }
  }

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The selected image format is not supported by this browser.'))
      element.src = sourceUrl
    })

    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(image, 0, 0, width, height)
      },
      close: () => undefined,
    }
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

function getScaledSize(width: number, height: number, maxDimension: number) {
  const longestSide = Math.max(width, height)
  if (longestSide <= maxDimension) return { width, height }

  const scale = maxDimension / longestSide
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Compresses a field-inspection photo before it is stored offline, uploaded to
 * Google Drive, or embedded in an Aide Memoire. The target is normally below
 * 700 KB while preserving the original aspect ratio.
 */
export async function compressInspectionImage(
  file: File,
  options: CompressionOptions = {},
): Promise<InspectionImageCompressionResult> {
  const maxDimension = options.maxDimension ?? 1920
  const targetMaxBytes = options.targetMaxBytes ?? 700 * 1024
  const initialQuality = options.initialQuality ?? 0.84
  const minimumQuality = options.minimumQuality ?? 0.48

  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image file.`)
  }

  const decoded = await decodeImage(file)
  try {
    let scaled = getScaledSize(decoded.width, decoded.height, maxDimension)
    let quality = initialQuality
    let bestBlob: Blob | null = null

    for (let resizePass = 0; resizePass < 3; resizePass += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = scaled.width
      canvas.height = scaled.height

      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('Image compression is unavailable on this device.')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, scaled.width, scaled.height)
      decoded.draw(context, scaled.width, scaled.height)

      quality = resizePass === 0 ? initialQuality : Math.min(initialQuality, quality + 0.08)

      while (quality >= minimumQuality) {
        const candidate = await canvasToBlob(canvas, quality)
        if (!bestBlob || candidate.size < bestBlob.size) bestBlob = candidate
        if (candidate.size <= targetMaxBytes) break
        quality -= 0.08
      }

      if (bestBlob && bestBlob.size <= targetMaxBytes) break

      scaled = {
        width: Math.max(1, Math.round(scaled.width * 0.84)),
        height: Math.max(1, Math.round(scaled.height * 0.84)),
      }
    }

    if (!bestBlob) throw new Error('The selected photo could not be compressed.')

    const compressedFile = new File([bestBlob], replaceExtensionWithJpeg(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    })

    const useOriginal =
      file.size <= targetMaxBytes &&
      file.type === 'image/jpeg' &&
      decoded.width <= maxDimension &&
      decoded.height <= maxDimension &&
      file.size <= compressedFile.size

    const outputFile = useOriginal ? file : compressedFile

    return {
      file: outputFile,
      originalSize: file.size,
      compressedSize: outputFile.size,
      compressed: outputFile !== file,
      width: scaled.width,
      height: scaled.height,
    }
  } finally {
    decoded.close()
  }
}
