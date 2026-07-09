export function getGoogleDriveFileId(value?: string | null) {
  if (!value) return ''

  const url = String(value).trim()

  const patterns = [
    /drive\.google\.com\/file\/d\/([^/?#]+)/i,
    /drive\.google\.com\/open\?id=([^&#]+)/i,
    /drive\.google\.com\/uc\?[^#]*id=([^&#]+)/i,
    /drive\.google\.com\/thumbnail\?[^#]*id=([^&#]+)/i,
    /[?&]id=([^&#]+)/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)

    if (match?.[1]) {
      return decodeURIComponent(match[1])
    }
  }

  return ''
}

export function getDriveImagePreviewUrl(value?: string | null, size = 1200) {
  const fileId = getGoogleDriveFileId(value)

  if (!fileId) return value || ''

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
    fileId,
  )}&sz=w${size}`
}

export function getDriveImageOpenUrl(value?: string | null) {
  const fileId = getGoogleDriveFileId(value)

  if (!fileId) return value || ''

  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
}

export function isGoogleDriveUrl(value?: string | null) {
  return Boolean(getGoogleDriveFileId(value))
}
