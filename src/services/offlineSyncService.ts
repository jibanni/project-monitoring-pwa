import { supabase } from '../lib/supabase'
import {
  offlineDb,
  type OfflineProjectPhoto,
  type OfflineProjectUpdate,
} from '../lib/offlineDb'

export async function saveOfflineProjectUpdate(
  update: OfflineProjectUpdate
) {
  return await offlineDb.project_updates.add(update)
}

export async function saveOfflineProjectPhotos(
  offlineUpdateId: number,
  projectId: string,
  files: File[]
) {
  for (const file of files) {
    await offlineDb.project_photos.add({
      offline_update_id: offlineUpdateId,
      project_id: projectId,
      file_name: file.name,
      file_type: file.type,
      file_blob: file,
      caption: file.name,
      created_at: new Date().toISOString(),
      synced: false,
    })
  }
}

export async function getPendingOfflineUpdates() {
  const allUpdates = await offlineDb.project_updates.toArray()

  return allUpdates.filter((update) => update.synced === false)
}

export async function getPendingOfflinePhotos() {
  const allPhotos = await offlineDb.project_photos.toArray()

  return allPhotos.filter((photo) => photo.synced === false)
}

export async function countPendingOfflineUpdates() {
  const pendingUpdates = await getPendingOfflineUpdates()

  return pendingUpdates.length
}

export async function countPendingOfflinePhotos() {
  const pendingPhotos = await getPendingOfflinePhotos()

  return pendingPhotos.length
}

async function syncPhotosForOfflineUpdate(
  offlineUpdateId: number,
  projectId: string,
  onlineProjectUpdateId: string
) {
  const photos = await offlineDb.project_photos
    .where('offline_update_id')
    .equals(offlineUpdateId)
    .and((photo: OfflineProjectPhoto) => photo.synced === false)
    .toArray()

  let uploadedPhotoCount = 0

  for (const photo of photos) {
    const fileExt = photo.file_name.split('.').pop() || 'jpg'

    const storagePath =
      `${projectId}/${onlineProjectUpdateId}-${Date.now()}-${photo.id}.${fileExt}`

    const uploadResult = await supabase.storage
      .from('project-photos')
      .upload(storagePath, photo.file_blob, {
        contentType: photo.file_type || 'image/jpeg',
      })

    if (uploadResult.error) {
      throw uploadResult.error
    }

    const {
      data: { publicUrl },
    } = supabase.storage
      .from('project-photos')
      .getPublicUrl(storagePath)

    const insertPhotoResult = await supabase
      .from('project_photos')
      .insert([
        {
          project_id: projectId,
          project_update_id: onlineProjectUpdateId,
          photo_url: publicUrl,
          caption: photo.caption,
        },
      ])

    if (insertPhotoResult.error) {
      throw insertPhotoResult.error
    }

    if (typeof photo.id === 'number') {
      await offlineDb.project_photos.delete(photo.id)
    }

    uploadedPhotoCount++
  }

  return uploadedPhotoCount
}

export async function syncOfflineUpdates() {
  const pendingUpdates = await getPendingOfflineUpdates()

  if (pendingUpdates.length === 0) {
    return {
      success: true,
      syncedCount: 0,
      syncedPhotoCount: 0,
      message: 'No pending offline updates.',
    }
  }

  let syncedCount = 0
  let syncedPhotoCount = 0

  for (const update of pendingUpdates) {
    if (typeof update.id !== 'number') {
      continue
    }

    const { id, synced, created_at, ...payload } = update

    const insertResult = await supabase
      .from('project_updates')
      .insert([payload])
      .select()
      .single()

    if (insertResult.error) {
      throw insertResult.error
    }

    const onlineProjectUpdateId = insertResult.data.id

    const projectResult = await supabase
      .from('projects')
      .update({
        status: update.status,
        physical_accomplishment:
          update.physical_accomplishment,
        financial_accomplishment:
          update.financial_accomplishment,
        risk_level: update.risk_level,
        last_inspection_date: update.inspection_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.project_id)

    if (projectResult.error) {
      throw projectResult.error
    }

    const uploadedPhotoCount =
      await syncPhotosForOfflineUpdate(
        id,
        update.project_id,
        onlineProjectUpdateId
      )

    syncedPhotoCount += uploadedPhotoCount

    await offlineDb.project_updates.delete(id)

    syncedCount++
  }

  return {
    success: true,
    syncedCount,
    syncedPhotoCount,
    message:
      `${syncedCount} offline update(s) and ` +
      `${syncedPhotoCount} offline photo(s) synced successfully.`,
  }
}