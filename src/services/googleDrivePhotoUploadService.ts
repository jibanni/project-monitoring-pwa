import { supabase } from '../lib/supabase'

export type GoogleDriveUploadedFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  webViewLink?: string
  webContentLink?: string
  thumbnailLink?: string
  previewUrl?: string
  directViewLink?: string
  folderId?: string
  folderName?: string
  fundingYearFolderId?: string
  fundingYearFolderName?: string
  fundingSourceFolderId?: string
  fundingSourceFolderName?: string
  projectFolderId?: string
  projectFolderName?: string
  updateFolderId?: string
  updateFolderName?: string
}

type GoogleDriveUploadResponse = {
  ok: boolean
  message: string
  file?: GoogleDriveUploadedFile
  error?: string
}

type UploadProjectPhotoToDriveParams = {
  file: File
  projectId: string
  updateId: string
  projectTitle?: string
  inspectionDate?: string
  fundingYear?: string
  fundingSource?: string
  fundingProgram?: string
  uploadedBy?: string
}

export function getDrivePhotoUrl(file: GoogleDriveUploadedFile) {
  if (file.previewUrl) return file.previewUrl
  if (file.directViewLink) return file.directViewLink

  if (file.id) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
      file.id,
    )}&sz=w1200`
  }

  if (file.thumbnailLink) return file.thumbnailLink
  if (file.webContentLink) return file.webContentLink
  if (file.webViewLink) return file.webViewLink

  return ''
}

export async function uploadProjectPhotoToDrive({
  file,
  projectId,
  updateId,
  projectTitle = '',
  inspectionDate = '',
  fundingYear = '',
  fundingSource = '',
  fundingProgram = '',
  uploadedBy = '',
}: UploadProjectPhotoToDriveParams) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('projectId', projectId)
  formData.append('updateId', updateId)
  formData.append('projectTitle', projectTitle)
  formData.append('inspectionDate', inspectionDate)
  formData.append('fundingYear', fundingYear)
  formData.append('fundingSource', fundingSource)
  formData.append('fundingProgram', fundingProgram)
  formData.append('uploadedBy', uploadedBy)

  const { data, error } = await supabase.functions.invoke<GoogleDriveUploadResponse>(
    'upload-project-photo-to-drive',
    {
      body: formData,
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to upload photo to Google Drive.')
  }

  if (!data?.ok || !data.file) {
    throw new Error(
      data?.error || data?.message || 'Unable to upload photo to Google Drive.',
    )
  }

  return data.file
}
