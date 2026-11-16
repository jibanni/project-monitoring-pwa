import { supabase } from '../lib/supabase'

const PHOTO_BUCKET = 'project-photos'

type ProjectPhotoRow = {
  id: string | number
  photo_url: string | null
  caption?: string | null
  uploaded_at?: string | null
}

function safeFileName(name: string) {
  return (
    name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase() || 'project-photo.jpg'
  )
}

function getStoragePathFromPublicUrl(photoUrl: string) {
  const cleanUrl = String(photoUrl || '').trim()

  if (!cleanUrl) return ''

  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
  const markerIndex = cleanUrl.indexOf(marker)

  if (markerIndex === -1) return ''

  const encodedPath = cleanUrl.slice(markerIndex + marker.length)

  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

async function deletePhotoRowsAndFiles(photos: ProjectPhotoRow[]) {
  const storagePaths = Array.from(
    new Set(
      photos
        .map((photo) => getStoragePathFromPublicUrl(photo.photo_url || ''))
        .filter(Boolean),
    ),
  )

  if (storagePaths.length > 0) {
    const storageDeleteResult = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove(storagePaths)

    if (storageDeleteResult.error) {
      throw storageDeleteResult.error
    }
  }

  const photoIds = photos
    .map((photo) => photo.id)
    .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')

  if (photoIds.length > 0) {
    const photoRowsDeleteResult = await supabase
      .from('project_photos')
      .delete()
      .in('id', photoIds as any[])

    if (photoRowsDeleteResult.error) {
      throw photoRowsDeleteResult.error
    }
  }

  return {
    deletedPhotoRows: photoIds.length,
    deletedStorageFiles: storagePaths.length,
  }
}

export async function uploadProjectPhoto(
  file: File,
  projectId: string,
  projectUpdateId: string,
  caption = '',
) {
  const cleanName = safeFileName(file.name)
  const storagePath = `${projectId}/${projectUpdateId}/${Date.now()}-${cleanName}`

  const uploadResult = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

  if (uploadResult.error) {
    throw uploadResult.error
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath)

  const insertResult = await supabase
    .from('project_photos')
    .insert([
      {
        project_id: projectId,
        project_update_id: projectUpdateId,
        photo_url: publicUrl,
        caption: caption || file.name,
        uploaded_at: new Date().toISOString(),
      },
    ])
    .select()

  if (insertResult.error) {
    throw insertResult.error
  }

  return insertResult.data
}

export async function getProjectPhotoPage(
  projectId: string,
  offset: number,
  pageSize: number,
  signal?: AbortSignal,
) {
  const query = supabase
    .from('project_photos')
    .select('id, photo_url, caption, uploaded_at')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize)
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) throw error

  const rows = (data || []) as ProjectPhotoRow[]
  const photos = rows.slice(0, pageSize)
  return {
    photos,
    nextOffset: offset + photos.length,
    hasMore: rows.length > pageSize,
  }
}

export async function getProjectPhotos(projectId: string) {
  const result = await supabase
    .from('project_photos')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })

  if (result.error) {
    throw result.error
  }

  return result.data
}

export async function deleteProjectPhotos(projectId: string) {
  const photosResult = await supabase
    .from('project_photos')
    .select('id, photo_url, uploaded_at')
    .eq('project_id', projectId)

  if (photosResult.error) {
    throw photosResult.error
  }

  const photos = (photosResult.data || []) as ProjectPhotoRow[]

  return deletePhotoRowsAndFiles(photos)
}