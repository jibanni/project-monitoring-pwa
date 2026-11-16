// Stored links are untrusted. Only Drive and the legacy Supabase photo bucket
// are supported, even if a record was created before server-side validation.
function trustedPhotoUrl(value?: string | null) {
  try {
    const url = new URL(String(value ?? '').trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (url.hostname === 'drive.google.com') return url
    const configured = import.meta.env.VITE_SUPABASE_URL
    const base = configured ? new URL(configured) : null
    if (base && url.origin === base.origin &&
      url.pathname.startsWith('/storage/v1/object/public/project-photos/')) return url
  } catch {
    // Reject malformed legacy URLs without interrupting the gallery.
  }
  return null
}

export function getGoogleDriveFileId(value?: string | null) {
  const url = trustedPhotoUrl(value)
  if (!url || url.hostname !== 'drive.google.com') return ''
  const pathId = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1]
  const id = pathId ?? (/^\/(?:open|uc|thumbnail)$/.test(url.pathname) ? url.searchParams.get('id') : '')
  return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : ''
}

export function getDriveImagePreviewUrl(value?: string | null, size = 1200) {
  const fileId = getGoogleDriveFileId(value)
  if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`
  const url = trustedPhotoUrl(value)
  return url && url.hostname !== 'drive.google.com' ? url.href : ''
}

export function getDriveImageOpenUrl(value?: string | null) {
  const fileId = getGoogleDriveFileId(value)
  if (fileId) return `https://drive.google.com/file/d/${fileId}/view`
  const url = trustedPhotoUrl(value)
  return url && url.hostname !== 'drive.google.com' ? url.href : undefined
}

export function isGoogleDriveUrl(value?: string | null) {
  return Boolean(getGoogleDriveFileId(value))
}
