import { supabase } from '../lib/supabase'

const PHOTO_BUCKET = 'project-photos'

function safeFileName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase() || 'project-photo.jpg'
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
