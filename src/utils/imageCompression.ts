export type ImageCompressionResult = {
  file: File
  originalSize: number
  compressedSize: number
  compressed: boolean
}

export type ImageCompressionOptions = {
  maxDimension?: number
  quality?: number
  maxOutputSize?: number
  outputType?: 'image/jpeg' | 'image/webp'
}

const DEFAULT_MAX_DIMENSION = 1280
const DEFAULT_QUALITY = 0.72
const DEFAULT_MAX_OUTPUT_SIZE = 700 * 1024
const DEFAULT_OUTPUT_TYPE = 'image/jpeg'

function getOutputFileName(originalName: string, outputType: string) {
  const cleanName = originalName.trim() || 'project-photo'
  const withoutExtension = cleanName.replace(/\.[^/.]+$/, '') || 'project-photo'
  const extension = outputType === 'image/webp' ? 'webp' : 'jpg'

  return `${withoutExtension}-optimized.${extension}`
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to optimize image.'))
          return
        }

        resolve(blob)
      },
      outputType,
      quality
    )
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image format is not supported for browser compression.'))
    }

    image.src = objectUrl
  })
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 KB'

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export async function compressImageFile(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<ImageCompressionResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION
  const startingQuality = options.quality ?? DEFAULT_QUALITY
  const maxOutputSize = options.maxOutputSize ?? DEFAULT_MAX_OUTPUT_SIZE
  const outputType = options.outputType ?? DEFAULT_OUTPUT_TYPE
  const originalSize = file.size

  try {
    const image = await loadImage(file)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height

    if (!sourceWidth || !sourceHeight) {
      return {
        file,
        originalSize,
        compressedSize: file.size,
        compressed: false,
      }
    }

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const context = canvas.getContext('2d')

    if (!context) {
      return {
        file,
        originalSize,
        compressedSize: file.size,
        compressed: false,
      }
    }

    // JPEG has no transparency, so use white background for PNG/WebP sources.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    let quality = Math.min(0.92, Math.max(0.45, startingQuality))
    let blob = await canvasToBlob(canvas, outputType, quality)

    // If output is still large, step quality down gradually.
    while (blob.size > maxOutputSize && quality > 0.46) {
      quality = Math.max(0.46, quality - 0.08)
      blob = await canvasToBlob(canvas, outputType, quality)
    }

    // Keep original if compression makes it larger.
    if (blob.size >= file.size) {
      return {
        file,
        originalSize,
        compressedSize: file.size,
        compressed: false,
      }
    }

    const optimizedFile = new File([blob], getOutputFileName(file.name, outputType), {
      type: outputType,
      lastModified: Date.now(),
    })

    return {
      file: optimizedFile,
      originalSize,
      compressedSize: optimizedFile.size,
      compressed: true,
    }
  } catch {
    // Some formats like HEIC may not be decodable by the browser.
    // Keep the original rather than blocking the field update.
    return {
      file,
      originalSize,
      compressedSize: file.size,
      compressed: false,
    }
  }
}
