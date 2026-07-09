const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type UploadResponse = {
  ok: boolean
  message: string
  file?: {
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
    updatesFolderId?: string
    updatesFolderName?: string
    updateFolderId?: string
    updateFolderName?: string
  }
  error?: string
}

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  webViewLink?: string
  webContentLink?: string
  thumbnailLink?: string
}

const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

function jsonResponse(payload: UploadResponse, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function sanitizeFileName(value: string) {
  return textValue(value)
    .replace(/[\\/:*?"<>|#%{}~&]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled'
}

function sanitizeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function normalizeDate(value: string) {
  const trimmed = textValue(value)

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = trimmed ? new Date(trimmed) : new Date()

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }

  return parsed.toISOString().slice(0, 10)
}

function normalizeFundingYear(value: string, inspectionDate: string) {
  const trimmed = textValue(value)

  const yearMatch = trimmed.match(/\b(20\d{2}|19\d{2})\b/)
  if (yearMatch?.[1]) return yearMatch[1]

  const dateYearMatch = textValue(inspectionDate).match(/^(\d{4})-/)
  if (dateYearMatch?.[1]) return dateYearMatch[1]

  return 'Unspecified Funding Year'
}

function normalizeFundingSource(value: string) {
  const trimmed = sanitizeFileName(value)

  if (!trimmed || trimmed === 'Untitled') {
    return 'Unspecified Program'
  }

  return trimmed
}

function shortId(value: string) {
  const clean = textValue(value).replace(/[^a-zA-Z0-9]/g, '')
  return clean ? clean.slice(0, 8) : crypto.randomUUID().slice(0, 8)
}

function getDrivePreviewUrl(fileId: string) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`
}

function getDriveDirectViewUrl(fileId: string) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
}

function getReadableDriveError(errorMessage: string) {
  const lower = errorMessage.toLowerCase()

  if (lower.includes('storage quota') || lower.includes('service accounts')) {
    return [
      'Google Drive upload failed because the service-account method has no Drive storage quota.',
      'Use the OAuth/My Drive method with GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.',
    ].join(' ')
  }

  if (lower.includes('file not found') || lower.includes('not found')) {
    return [
      'Google Drive folder was not found.',
      'Please check GOOGLE_DRIVE_FOLDER_ID and confirm the OAuth-authorized Google account can open that folder.',
    ].join(' ')
  }

  if (lower.includes('invalid_grant')) {
    return [
      'Google OAuth refresh token is invalid or expired.',
      'Generate a new refresh token using OAuth Playground and save it again to Supabase secrets.',
    ].join(' ')
  }

  if (lower.includes('invalid_client')) {
    return [
      'Google OAuth Client ID or Client Secret is invalid.',
      'Please check GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Supabase secrets.',
    ].join(' ')
  }

  if (lower.includes('insufficient') || lower.includes('permission')) {
    return [
      'Google Drive permission is insufficient.',
      'Confirm the OAuth scope includes Drive upload access and that the selected Google account owns or can access the target folder.',
    ].join(' ')
  }

  return errorMessage
}

async function getGoogleAccessToken() {
  const clientId = getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = getRequiredEnv('GOOGLE_OAUTH_CLIENT_SECRET')
  const refreshToken = getRequiredEnv('GOOGLE_OAUTH_REFRESH_TOKEN')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('Google OAuth refresh error:', data)

    throw new Error(
      data.error_description ||
        data.error ||
        'Unable to refresh Google access token.',
    )
  }

  if (!data.access_token) {
    throw new Error('Google did not return an access token.')
  }

  return data.access_token as string
}

async function driveFetch<T>(
  accessToken: string,
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    console.error('Google Drive API error:', data)
    throw new Error(
      data?.error?.message ||
        data?.error_description ||
        data?.error ||
        'Google Drive API request failed.',
    )
  }

  return data as T
}

async function findFolderByName(params: {
  accessToken: string
  parentFolderId: string
  folderName: string
}) {
  const { accessToken, parentFolderId, folderName } = params

  const query = [
    `mimeType='${DRIVE_FOLDER_MIME_TYPE}'`,
    'trashed=false',
    `'${sanitizeDriveQueryValue(parentFolderId)}' in parents`,
    `name='${sanitizeDriveQueryValue(folderName)}'`,
  ].join(' and ')

  const url =
    'https://www.googleapis.com/drive/v3/files' +
    `?q=${encodeURIComponent(query)}` +
    '&fields=files(id,name,mimeType)' +
    '&supportsAllDrives=true' +
    '&includeItemsFromAllDrives=true'

  const data = await driveFetch<{ files: DriveFile[] }>(accessToken, url)

  return data.files?.[0] || null
}

async function createFolder(params: {
  accessToken: string
  parentFolderId: string
  folderName: string
}) {
  const { accessToken, parentFolderId, folderName } = params

  const url =
    'https://www.googleapis.com/drive/v3/files' +
    '?fields=id,name,mimeType,webViewLink' +
    '&supportsAllDrives=true'

  return driveFetch<DriveFile>(accessToken, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [parentFolderId],
    }),
  })
}

async function findOrCreateFolder(params: {
  accessToken: string
  parentFolderId: string
  folderName: string
}) {
  const existingFolder = await findFolderByName(params)

  if (existingFolder) return existingFolder

  return createFolder(params)
}

async function makeFileReadableByLink(accessToken: string, fileId: string) {
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions` +
    '?supportsAllDrives=true'

  try {
    await driveFetch(accessToken, url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
        allowFileDiscovery: false,
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (!message.toLowerCase().includes('permission')) {
      throw error
    }

    console.warn('Drive permission warning:', message)
  }
}

async function uploadFileToGoogleDrive(params: {
  accessToken: string
  updateFolderId: string
  updateFolderName: string
  updatesFolderId: string
  updatesFolderName: string
  fundingYearFolderId: string
  fundingYearFolderName: string
  fundingSourceFolderId: string
  fundingSourceFolderName: string
  projectFolderId: string
  projectFolderName: string
  file: File
  fileName: string
  projectId: string
  updateId: string
  projectTitle: string
  inspectionDate: string
  fundingYear: string
  fundingSource: string
  uploadedBy: string
}) {
  const {
    accessToken,
    updateFolderId,
    updateFolderName,
    updatesFolderId,
    updatesFolderName,
    fundingYearFolderId,
    fundingYearFolderName,
    fundingSourceFolderId,
    fundingSourceFolderName,
    projectFolderId,
    projectFolderName,
    file,
    fileName,
    projectId,
    updateId,
    projectTitle,
    inspectionDate,
    fundingYear,
    fundingSource,
    uploadedBy,
  } = params

  const metadata = {
    name: fileName,
    parents: [updateFolderId],
    description: [
      'PMS10 Project Update Photo',
      projectTitle ? `Project: ${projectTitle}` : '',
      fundingYear ? `Funding year: ${fundingYear}` : '',
      fundingSource ? `Funding source/program: ${fundingSource}` : '',
      inspectionDate ? `Inspection date: ${inspectionDate}` : '',
      projectId ? `Project ID: ${projectId}` : '',
      updateId ? `Update ID: ${updateId}` : '',
      uploadedBy ? `Uploaded by: ${uploadedBy}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    appProperties: {
      source: 'PMS10',
      projectId,
      updateId,
      inspectionDate,
      fundingYear,
      fundingSource,
      uploadedBy,
      fundingYearFolderId,
      fundingSourceFolderId,
      projectFolderId,
      updatesFolderId,
      updateFolderId,
    },
  }

  const boundary = `pms10_drive_upload_${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const fileBytes = new Uint8Array(await file.arrayBuffer())

  const body = new Blob(
    [
      encoder.encode(
        `--${boundary}\r\n` +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          `${JSON.stringify(metadata)}\r\n`,
      ),
      encoder.encode(
        `--${boundary}\r\n` +
          `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
      ),
      fileBytes,
      encoder.encode(`\r\n--${boundary}--`),
    ],
    {
      type: `multipart/related; boundary=${boundary}`,
    },
  )

  const fields =
    'id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink'

  const uploadUrl =
    `https://www.googleapis.com/upload/drive/v3/files` +
    `?uploadType=multipart` +
    `&fields=${encodeURIComponent(fields)}` +
    `&supportsAllDrives=true`

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('Google Drive upload error:', data)

    throw new Error(
      data.error?.message ||
        data.error_description ||
        data.error ||
        'Unable to upload file to Google Drive.',
    )
  }

  await makeFileReadableByLink(accessToken, data.id)

  const previewUrl = getDrivePreviewUrl(data.id)
  const directViewLink = getDriveDirectViewUrl(data.id)

  return {
    ...(data as DriveFile),
    previewUrl,
    directViewLink,
    folderId: updateFolderId,
    folderName: updateFolderName,
    fundingYearFolderId,
    fundingYearFolderName,
    fundingSourceFolderId,
    fundingSourceFolderName,
    projectFolderId,
    projectFolderName,
    updatesFolderId,
    updatesFolderName,
    updateFolderId,
    updateFolderName,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        message: 'Method not allowed.',
        error: 'Only POST requests are supported.',
      },
      405,
    )
  }

  try {
    const rootFolderId = getRequiredEnv('GOOGLE_DRIVE_FOLDER_ID')

    const formData = await request.formData()
    const fileField = formData.get('file')

    if (!fileField || typeof (fileField as File).arrayBuffer !== 'function') {
      return jsonResponse(
        {
          ok: false,
          message: 'No photo file received.',
          error: 'Missing form-data field: file',
        },
        400,
      )
    }

    const file = fileField as File

    const projectId = textValue(formData.get('projectId'))
    const updateId = textValue(formData.get('updateId'))
    const projectTitle = textValue(formData.get('projectTitle')) || 'Untitled Project'
    const uploadedBy = textValue(formData.get('uploadedBy')) || 'PMS10 User'
    const inspectionDate = normalizeDate(textValue(formData.get('inspectionDate')))

    const fundingYear = normalizeFundingYear(
      textValue(formData.get('fundingYear')),
      inspectionDate,
    )

    const fundingSource = normalizeFundingSource(
      textValue(formData.get('fundingSource')) ||
        textValue(formData.get('fundingProgram')) ||
        'Unspecified Program',
    )

    if (!file.type.startsWith('image/')) {
      return jsonResponse(
        {
          ok: false,
          message: 'Invalid file type.',
          error: 'Only image files are allowed.',
        },
        400,
      )
    }

    const accessToken = await getGoogleAccessToken()

    const fundingYearFolderName = sanitizeFileName(fundingYear)
    const fundingSourceFolderName = sanitizeFileName(fundingSource)

    const projectFolderName = sanitizeFileName(
      `${projectTitle} - ${shortId(projectId)}`,
    )

    const updateFolderName = sanitizeFileName(
      `${inspectionDate} Inspection - ${shortId(updateId)}`,
    )

    const fundingYearFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: rootFolderId,
      folderName: fundingYearFolderName,
    })

    const fundingSourceFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: fundingYearFolder.id,
      folderName: fundingSourceFolderName,
    })

    const projectFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: fundingSourceFolder.id,
      folderName: projectFolderName,
    })

    const updatesFolderName = 'Updates'

    const updatesFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: projectFolder.id,
      folderName: updatesFolderName,
    })

    const updateFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: updatesFolder.id,
      folderName: updateFolderName,
    })

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '')

    const cleanOriginalName = sanitizeFileName(file.name || 'photo.jpg')
    const fileName = `${inspectionDate}_${timestamp}_${cleanOriginalName}`

    const uploadedFile = await uploadFileToGoogleDrive({
      accessToken,
      updateFolderId: updateFolder.id,
      updateFolderName,
      updatesFolderId: updatesFolder.id,
      updatesFolderName,
      fundingYearFolderId: fundingYearFolder.id,
      fundingYearFolderName,
      fundingSourceFolderId: fundingSourceFolder.id,
      fundingSourceFolderName,
      projectFolderId: projectFolder.id,
      projectFolderName,
      file,
      fileName,
      projectId,
      updateId,
      projectTitle,
      inspectionDate,
      fundingYear,
      fundingSource,
      uploadedBy,
    })

    return jsonResponse({
      ok: true,
      message: 'Photo uploaded to Google Drive.',
      file: uploadedFile,
    })
  } catch (error) {
    console.error(error)

    const rawMessage =
      error instanceof Error ? error.message : 'Unexpected upload error.'

    return jsonResponse(
      {
        ok: false,
        message: 'Google Drive upload failed.',
        error: getReadableDriveError(rawMessage),
      },
      500,
    )
  }
})
