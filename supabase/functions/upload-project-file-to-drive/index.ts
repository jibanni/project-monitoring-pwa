import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const MAX_PHOTO_BYTES = 700 * 1024
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

type FileKind = 'photo' | 'aide-memoire'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  webViewLink?: string
  webContentLink?: string
  thumbnailLink?: string
}

type AuthorizedUploader = {
  userId: string
  label: string
  projectTitle: string
  fundingYear: string
  fundingSource: string
  inspectionDate: string
  province: string
  municipality: string
}

type UploadResponse = {
  ok: boolean
  message: string
  file?: DriveFile & Record<string, unknown>
  document?: Record<string, unknown>
  error?: string
}

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
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function textKey(value: unknown) {
  return textValue(value).toLowerCase().replace(/\s+/g, ' ')
}

function sameText(left: unknown, right: unknown) {
  const leftKey = textKey(left)
  const rightKey = textKey(right)
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function canonicalRole(value: unknown) {
  const role = textKey(value)
  if (role === 'admin') return 'Admin'
  if (role === 'ro engineer' || role === 'ro engineers') return 'RO Engineer'
  if (role === 'engineer' || role === 'po engineer' || role === 'po engineers') {
    return 'PO Engineer'
  }
  if (role === 'peo' || role === 'project evaluation officer') return 'PEO'
  return textValue(value)
}

function sanitizeFileName(value: string) {
  return (
    textValue(value)
      .replace(/[\\/:*?"<>|#%{}~&]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Untitled'
  )
}

function sanitizeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function shortId(value: string) {
  const clean = textValue(value).replace(/[^a-zA-Z0-9]/g, '')
  return clean ? clean.slice(0, 8) : crypto.randomUUID().slice(0, 8)
}

function normalizeDate(value: string) {
  const trimmed = textValue(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = trimmed ? new Date(trimmed) : new Date()
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function normalizeFundingYear(value: string, inspectionDate: string) {
  const match = textValue(value).match(/\b(20\d{2}|19\d{2})\b/)
  if (match?.[1]) return match[1]

  const dateMatch = textValue(inspectionDate).match(/^(\d{4})-/)
  if (dateMatch?.[1]) return dateMatch[1]

  return 'Unspecified Funding Year'
}

function normalizeFundingSource(value: string) {
  const clean = sanitizeFileName(value)
  return clean && clean !== 'Untitled' ? clean : 'Unspecified Program'
}

function canonicalHuc(value: unknown) {
  const key = textKey(value).replace(/[.,]/g, '')
  if (
    key === 'cagayan de oro' ||
    key === 'cagayan de oro city' ||
    key === 'cdo' ||
    key === 'city of cagayan de oro'
  ) {
    return 'Cagayan de Oro City'
  }
  if (
    key === 'iligan' ||
    key === 'iligan city' ||
    key === 'city of iligan'
  ) {
    return 'Iligan City'
  }
  return ''
}

function resolveGeography(provinceValue: unknown, municipalityValue: unknown) {
  const province = textValue(provinceValue)
  const municipality = textValue(municipalityValue)
  const huc = canonicalHuc(municipality) || canonicalHuc(province)

  if (huc) {
    return {
      provinceFolderName: 'HUC',
      lguFolderName: huc,
      provinceLabel: 'HUC',
      lguLabel: huc,
    }
  }

  const provinceLabel = province || 'Unspecified Province'
  const lguLabel = municipality || `PLGU ${provinceLabel}`

  return {
    provinceFolderName: sanitizeFileName(provinceLabel),
    lguFolderName: sanitizeFileName(lguLabel),
    provinceLabel,
    lguLabel,
  }
}

async function authorizeUploader(
  request: Request,
  projectId: string,
  updateId: string,
): Promise<AuthorizedUploader> {
  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('PMS10_AUTH_REQUIRED')

  const supabaseUrl = getRequiredEnv('SUPABASE_URL')
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY')
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const userResult = await authClient.auth.getUser(token)
  if (userResult.error || !userResult.data.user) throw new Error('PMS10_AUTH_REQUIRED')
  const user = userResult.data.user

  const [profileResult, projectResult, updateResult] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, full_name, email, role, approved, is_active, province, municipality')
      .eq('id', user.id)
      .maybeSingle(),
    adminClient
      .from('projects')
      .select('id, project_name, funding_year, funding_source, province, municipality')
      .eq('id', projectId)
      .maybeSingle(),
    adminClient
      .from('project_updates')
      .select('id, project_id, inspection_date')
      .eq('id', updateId)
      .maybeSingle(),
  ])

  if (profileResult.error) throw profileResult.error
  if (projectResult.error) throw projectResult.error
  if (updateResult.error) throw updateResult.error

  const profile = profileResult.data
  const project = projectResult.data
  const update = updateResult.data

  if (!profile || profile.approved !== true || profile.is_active === false) {
    throw new Error('PMS10_UPLOAD_FORBIDDEN')
  }
  if (!project || !update || textValue(update.project_id) !== projectId) {
    throw new Error('PMS10_UPLOAD_FORBIDDEN')
  }

  const role = canonicalRole(profile.role)
  let allowed = role === 'Admin'

  if (role === 'RO Engineer') {
    const assignmentResult = await adminClient
      .from('ro_engineer_province_assignments')
      .select('province')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (assignmentResult.error) throw assignmentResult.error
    const assignments = assignmentResult.data || []
    allowed = assignments.length > 0
      ? assignments.some((assignment) => sameText(assignment.province, project.province))
      : sameText(profile.province, project.province)
  }

  if (role === 'PO Engineer') {
    const assignmentResult = await adminClient
      .from('po_engineer_lgu_assignments')
      .select('province, municipality')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (assignmentResult.error) throw assignmentResult.error
    const assignments = assignmentResult.data || []
    allowed = assignments.length > 0
      ? assignments.some(
          (assignment) =>
            sameText(assignment.province, project.province) &&
            sameText(assignment.municipality, project.municipality),
        )
      : sameText(profile.province, project.province) &&
        sameText(profile.municipality, project.municipality)
  }

  if (role === 'PEO') {
    allowed = sameText(profile.province, project.province)
  }

  if (!allowed) throw new Error('PMS10_UPLOAD_FORBIDDEN')

  return {
    userId: user.id,
    label:
      textValue(profile.full_name) ||
      textValue(profile.email) ||
      textValue(user.email) ||
      user.id,
    projectTitle: textValue(project.project_name),
    fundingYear: textValue(project.funding_year),
    fundingSource: textValue(project.funding_source),
    inspectionDate: textValue(update.inspection_date),
    province: textValue(project.province),
    municipality: textValue(project.municipality),
  }
}

function getDrivePreviewUrl(fileId: string) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`
}

function getDriveDirectViewUrl(fileId: string) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
}

function getDriveDownloadUrl(fileId: string) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
}

function getReadableDriveError(errorMessage: string) {
  const lower = errorMessage.toLowerCase()

  if (lower.includes('storage quota') || lower.includes('service accounts')) {
    return [
      'Google Drive upload failed because the service-account method has no Drive storage quota.',
      'Use the OAuth/My Drive method configured for PMS10.',
    ].join(' ')
  }
  if (
    lower.includes('pms10 drive root is not accessible') ||
    lower.includes('resolves to') ||
    lower.includes('cannot create files or folders')
  ) {
    return errorMessage
  }
  if (lower.includes('file not found') || lower.includes('not found')) {
    return 'Google Drive folder was not found. Check GOOGLE_DRIVE_FOLDER_ID and account access.'
  }
  if (lower.includes('invalid_grant')) {
    return 'Google OAuth refresh token is invalid or expired.'
  }
  if (lower.includes('invalid_client')) {
    return 'Google OAuth Client ID or Client Secret is invalid.'
  }
  if (lower.includes('insufficient') || lower.includes('permission')) {
    return 'Google Drive permission is insufficient for the configured PMS10 account.'
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
    throw new Error(
      data.error_description ||
        data.error ||
        'Unable to refresh Google access token.',
    )
  }
  if (!data.access_token) throw new Error('Google did not return an access token.')
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
    throw new Error(
      data?.error?.message ||
        data?.error_description ||
        data?.error ||
        'Google Drive API request failed.',
    )
  }
  return data as T
}


type DriveAbout = {
  user?: {
    displayName?: string
    emailAddress?: string
    permissionId?: string
  }
}

type DriveRootFolder = DriveFile & {
  driveId?: string
  capabilities?: {
    canAddChildren?: boolean
  }
}

async function getDriveIdentity(accessToken: string) {
  try {
    return await driveFetch<DriveAbout>(
      accessToken,
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId)',
    )
  } catch (error) {
    console.warn('Unable to read Google Drive account identity.', error)
    return null
  }
}

async function validateDriveRootFolder(params: {
  accessToken: string
  rootFolderId: string
}) {
  const identity = await getDriveIdentity(params.accessToken)
  const accountEmail = textValue(identity?.user?.emailAddress)
  const accountLabel =
    accountEmail ||
    textValue(identity?.user?.displayName) ||
    'the configured OAuth account'

  const fields = [
    'id',
    'name',
    'mimeType',
    'driveId',
    'parents',
    'capabilities(canAddChildren)',
  ].join(',')

  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.rootFolderId)}` +
    `?fields=${encodeURIComponent(fields)}` +
    '&supportsAllDrives=true'

  let folder: DriveRootFolder
  try {
    folder = await driveFetch<DriveRootFolder>(
      params.accessToken,
      url,
    )
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    if (raw.toLowerCase().includes('not found')) {
      throw new Error(
        `PMS10 Drive root is not accessible to ${accountLabel}. ` +
          'Use a Google OAuth refresh token authorized by the Google account that owns or can edit the existing PMS10 Drive folder.',
      )
    }
    throw error
  }

  if (folder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
    throw new Error(
      `GOOGLE_DRIVE_FOLDER_ID resolves to "${folder.name || 'an item'}", but it is not a Google Drive folder.`,
    )
  }

  if (folder.capabilities?.canAddChildren === false) {
    throw new Error(
      `The PMS10 Drive root is visible to ${accountLabel}, but that account cannot create files or folders inside it. Grant Editor access or authorize the folder owner account.`,
    )
  }

  return {
    folder,
    accountEmail,
    accountLabel,
  }
}

async function findFolderByName(params: {
  accessToken: string
  parentFolderId: string
  folderName: string
}) {
  const query = [
    `mimeType='${DRIVE_FOLDER_MIME_TYPE}'`,
    'trashed=false',
    `'${sanitizeDriveQueryValue(params.parentFolderId)}' in parents`,
    `name='${sanitizeDriveQueryValue(params.folderName)}'`,
  ].join(' and ')

  const url =
    'https://www.googleapis.com/drive/v3/files' +
    `?q=${encodeURIComponent(query)}` +
    '&fields=files(id,name,mimeType)' +
    '&supportsAllDrives=true' +
    '&includeItemsFromAllDrives=true'

  const data = await driveFetch<{ files: DriveFile[] }>(params.accessToken, url)
  return data.files?.[0] || null
}

async function createFolder(params: {
  accessToken: string
  parentFolderId: string
  folderName: string
}) {
  const url =
    'https://www.googleapis.com/drive/v3/files' +
    '?fields=id,name,mimeType,webViewLink' +
    '&supportsAllDrives=true'

  return driveFetch<DriveFile>(params.accessToken, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: params.folderName,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [params.parentFolderId],
    }),
  })
}

async function findOrCreateFolder(params: {
  accessToken: string
  parentFolderId: string
  folderName: string
}) {
  const existing = await findFolderByName(params)
  return existing || createFolder(params)
}

async function makeFileReadableByLink(accessToken: string, fileId: string) {
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions` +
    '?supportsAllDrives=true'

  try {
    await driveFetch(accessToken, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
        allowFileDiscovery: false,
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('permission')) throw error
    console.warn('Drive permission warning:', message)
  }
}

async function createAssetKey(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `pms10-${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`
}

async function findFileByAppProperty(params: {
  accessToken: string
  parentFolderId: string
  propertyKey: string
  propertyValue: string
}) {
  const query = [
    'trashed=false',
    `'${sanitizeDriveQueryValue(params.parentFolderId)}' in parents`,
    `appProperties has { key='${sanitizeDriveQueryValue(params.propertyKey)}' and value='${sanitizeDriveQueryValue(params.propertyValue)}' }`,
  ].join(' and ')

  const fields = 'files(id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink)'
  const url =
    'https://www.googleapis.com/drive/v3/files' +
    `?q=${encodeURIComponent(query)}` +
    `&fields=${encodeURIComponent(fields)}` +
    '&supportsAllDrives=true' +
    '&includeItemsFromAllDrives=true'

  const data = await driveFetch<{ files: DriveFile[] }>(params.accessToken, url)
  return data.files?.[0] || null
}

function buildMultipartBody(metadata: Record<string, unknown>, file: File) {
  const boundary = `pms10_drive_upload_${crypto.randomUUID()}`
  const encoder = new TextEncoder()

  return file.arrayBuffer().then((buffer) => {
    const fileBytes = new Uint8Array(buffer)
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
      { type: `multipart/related; boundary=${boundary}` },
    )

    return { boundary, body }
  })
}

async function uploadDriveFile(params: {
  accessToken: string
  parentFolderId: string
  file: File
  fileName: string
  metadata: Record<string, unknown>
  existingFileId?: string
}) {
  const metadata = {
    ...params.metadata,
    name: params.fileName,
    ...(params.existingFileId ? {} : { parents: [params.parentFolderId] }),
  }
  const { boundary, body } = await buildMultipartBody(metadata, params.file)

  const fields = 'id,name,mimeType,size,webViewLink,webContentLink,thumbnailLink'
  const base = params.existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(params.existingFileId)}`
    : 'https://www.googleapis.com/upload/drive/v3/files'
  const url =
    `${base}?uploadType=multipart` +
    `&fields=${encodeURIComponent(fields)}` +
    '&supportsAllDrives=true'

  const response = await fetch(url, {
    method: params.existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        data.error_description ||
        data.error ||
        'Unable to upload file to Google Drive.',
    )
  }

  await makeFileReadableByLink(params.accessToken, data.id)
  return data as DriveFile
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, message: 'Method not allowed.', error: 'Only POST is supported.' },
      405,
    )
  }

  try {
    const rootFolderId = getRequiredEnv('GOOGLE_DRIVE_FOLDER_ID')
    const formData = await request.formData()
    const fileField = formData.get('file')

    if (!fileField || typeof (fileField as File).arrayBuffer !== 'function') {
      return jsonResponse(
        { ok: false, message: 'No file received.', error: 'Missing form-data field: file' },
        400,
      )
    }

    const file = fileField as File
    const fileKind = textValue(formData.get('fileKind')) as FileKind
    const assetId = textValue(formData.get('assetId'))
    const projectId = textValue(formData.get('projectId'))
    const updateId = textValue(formData.get('updateId'))
    const aideMemoireId = textValue(formData.get('aideMemoireId'))
    const documentFormat = textValue(formData.get('documentFormat')).toLowerCase()
    const generatedAt = textValue(formData.get('generatedAt')) || new Date().toISOString()

    if (fileKind !== 'photo' && fileKind !== 'aide-memoire') {
      return jsonResponse(
        { ok: false, message: 'Invalid file kind.', error: 'fileKind must be photo or aide-memoire.' },
        400,
      )
    }

    if (!projectId || !updateId) {
      return jsonResponse(
        { ok: false, message: 'Missing project reference.', error: 'projectId and updateId are required.' },
        400,
      )
    }

    if (fileKind === 'photo') {
      if (!file.type.startsWith('image/')) {
        return jsonResponse(
          { ok: false, message: 'Invalid photo type.', error: 'Only image files are allowed for photos.' },
          400,
        )
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return jsonResponse(
          { ok: false, message: 'Photo is too large.', error: 'Inspection photos must be 700 KB or less.' },
          413,
        )
      }
    }

    if (fileKind === 'aide-memoire') {
      const allowed =
        file.type === 'application/pdf' ||
        file.type ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        /\.pdf$/i.test(file.name) ||
        /\.docx$/i.test(file.name)

      if (!allowed) {
        return jsonResponse(
          { ok: false, message: 'Invalid document type.', error: 'Aide Memoire must be PDF or DOCX.' },
          400,
        )
      }
      if (!aideMemoireId || !['pdf', 'docx'].includes(documentFormat)) {
        return jsonResponse(
          { ok: false, message: 'Missing document reference.', error: 'aideMemoireId and documentFormat are required.' },
          400,
        )
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        return jsonResponse(
          { ok: false, message: 'Document is too large.', error: 'Aide Memoire files must be 20 MB or less.' },
          413,
        )
      }
    }

    const uploader = await authorizeUploader(request, projectId, updateId)
    const inspectionDate = normalizeDate(uploader.inspectionDate)
    const fundingYear = normalizeFundingYear(uploader.fundingYear, inspectionDate)
    const fundingSource = normalizeFundingSource(
      uploader.fundingSource || 'Unspecified Program',
    )
    const geography = resolveGeography(uploader.province, uploader.municipality)

    const accessToken = await getGoogleAccessToken()
    await validateDriveRootFolder({
      accessToken,
      rootFolderId,
    })

    const fundingYearFolderName = sanitizeFileName(
      /^\d{4}$/.test(fundingYear) ? `FY ${fundingYear}` : fundingYear,
    )
    const fundingYearFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: rootFolderId,
      folderName: fundingYearFolderName,
    })
    const provinceFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: fundingYearFolder.id,
      folderName: geography.provinceFolderName,
    })
    const lguFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: provinceFolder.id,
      folderName: geography.lguFolderName,
    })
    const programFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: lguFolder.id,
      folderName: sanitizeFileName(fundingSource),
    })
    const projectFolderName = sanitizeFileName(
      `${uploader.projectTitle || 'Untitled Project'} - ${shortId(projectId)}`,
    )
    const projectFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: programFolder.id,
      folderName: projectFolderName,
    })
    const updatesFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: projectFolder.id,
      folderName: 'Updates',
    })
    const updateFolderName = sanitizeFileName(
      `${inspectionDate} Inspection - ${shortId(updateId)}`,
    )
    const updateFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: updatesFolder.id,
      folderName: updateFolderName,
    })
    const assetFolderName = fileKind === 'photo' ? 'Photos' : 'Aide Memoire'
    const assetFolder = await findOrCreateFolder({
      accessToken,
      parentFolderId: updateFolder.id,
      folderName: assetFolderName,
    })

    const assetKey = await createAssetKey(
      fileKind === 'photo'
        ? [projectId, updateId, assetId || `${file.name}:${file.size}`].join(':')
        : [fileKind, projectId, updateId, aideMemoireId, documentFormat].join(':'),
    )

    let existingFile = await findFileByAppProperty({
      accessToken,
      parentFolderId: assetFolder.id,
      propertyKey: 'assetKey',
      propertyValue: assetKey,
    })

    /*
     * Existing PMS10 photo uploads used the property name photoKey.
     * Search it too so a retry after this upgrade does not duplicate a file.
     */
    if (!existingFile && fileKind === 'photo') {
      existingFile = await findFileByAppProperty({
        accessToken,
        parentFolderId: assetFolder.id,
        propertyKey: 'photoKey',
        propertyValue: assetKey,
      })
    }

    if (fileKind === 'photo' && existingFile) {
      return jsonResponse({
        ok: true,
        message: 'Existing Google Drive photo reused.',
        file: {
          ...existingFile,
          previewUrl: getDrivePreviewUrl(existingFile.id),
          directViewLink: getDriveDirectViewUrl(existingFile.id),
          downloadUrl: getDriveDownloadUrl(existingFile.id),
          folderId: assetFolder.id,
          folderName: assetFolderName,
          fundingYearFolderId: fundingYearFolder.id,
          fundingYearFolderName,
          provinceFolderId: provinceFolder.id,
          provinceFolderName: geography.provinceFolderName,
          lguFolderId: lguFolder.id,
          lguFolderName: geography.lguFolderName,
          fundingSourceFolderId: programFolder.id,
          fundingSourceFolderName: fundingSource,
          projectFolderId: projectFolder.id,
          projectFolderName,
          updatesFolderId: updatesFolder.id,
          updatesFolderName: 'Updates',
          updateFolderId: updateFolder.id,
          updateFolderName,
          assetFolderId: assetFolder.id,
          assetFolderName,
        },
      })
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '')

    const fileName =
      fileKind === 'photo'
        ? `${inspectionDate}_${timestamp}_${sanitizeFileName(file.name || 'photo.jpg')}`
        : sanitizeFileName(file.name || `Aide Memoire.${documentFormat}`)

    const storagePath = [
      fundingYearFolderName,
      geography.provinceFolderName,
      geography.lguFolderName,
      fundingSource,
      projectFolderName,
      'Updates',
      updateFolderName,
      assetFolderName,
      fileName,
    ].join(' / ')

    const metadata = {
      description: [
        fileKind === 'photo'
          ? 'PMS10 Project Update Photo'
          : 'PMS10 Generated Aide Memoire',
        uploader.projectTitle ? `Project: ${uploader.projectTitle}` : '',
        `Province/HUC: ${geography.provinceLabel}`,
        `LGU: ${geography.lguLabel}`,
        `Funding year: ${fundingYear}`,
        `Program: ${fundingSource}`,
        `Inspection date: ${inspectionDate}`,
        `Project ID: ${projectId}`,
        `Update ID: ${updateId}`,
        `Uploaded by: ${uploader.label}`,
      ]
        .filter(Boolean)
        .join('\n'),
      appProperties: {
        source: 'PMS10',
        fileKind,
        assetKey,
        ...(fileKind === 'photo' ? { photoKey: assetKey } : {}),
        projectId,
        updateId,
        inspectionDate,
        fundingYear,
        fundingSource,
        province: geography.provinceLabel,
        lgu: geography.lguLabel,
        uploadedBy: uploader.userId,
        ...(fileKind === 'aide-memoire'
          ? { aideMemoireId, documentFormat }
          : {}),
      },
    }

    const uploadedFile = await uploadDriveFile({
      accessToken,
      parentFolderId: assetFolder.id,
      file,
      fileName,
      metadata,
      existingFileId:
        fileKind === 'aide-memoire' ? existingFile?.id : undefined,
    })

    const enrichedFile = {
      ...uploadedFile,
      previewUrl:
        fileKind === 'photo'
          ? getDrivePreviewUrl(uploadedFile.id)
          : uploadedFile.webViewLink || getDriveDirectViewUrl(uploadedFile.id),
      directViewLink: getDriveDirectViewUrl(uploadedFile.id),
      downloadUrl: getDriveDownloadUrl(uploadedFile.id),
      folderId: assetFolder.id,
      folderName: assetFolderName,
      fundingYearFolderId: fundingYearFolder.id,
      fundingYearFolderName,
      provinceFolderId: provinceFolder.id,
      provinceFolderName: geography.provinceFolderName,
      lguFolderId: lguFolder.id,
      lguFolderName: geography.lguFolderName,
      fundingSourceFolderId: programFolder.id,
      fundingSourceFolderName: fundingSource,
      projectFolderId: projectFolder.id,
      projectFolderName,
      updatesFolderId: updatesFolder.id,
      updatesFolderName: 'Updates',
      updateFolderId: updateFolder.id,
      updateFolderName,
      assetFolderId: assetFolder.id,
      assetFolderName,
      storagePath,
    }

    if (fileKind === 'photo') {
      return jsonResponse({
        ok: true,
        message: 'Photo uploaded to Google Drive.',
        file: enrichedFile,
      })
    }

    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = getRequiredEnv('SUPABASE_URL')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const documentPayload = {
      project_id: projectId,
      project_update_id: updateId,
      aide_memoire_id: aideMemoireId,
      document_type: 'Aide Memoire',
      document_format: documentFormat,
      file_name: fileName,
      mime_type: file.type || uploadedFile.mimeType,
      file_url:
        uploadedFile.webViewLink ||
        getDriveDirectViewUrl(uploadedFile.id),
      drive_file_id: uploadedFile.id,
      drive_folder_id: assetFolder.id,
      storage_path: storagePath,
      province: geography.provinceLabel,
      lgu: geography.lguLabel,
      funding_year: fundingYear,
      program: fundingSource,
      generated_by_name: uploader.label,
      uploaded_by: uploader.userId,
      uploaded_at: new Date().toISOString(),
      generated_at: generatedAt,
      synced_at: new Date().toISOString(),
      sync_status: 'synced',
    }

    const documentResult = await adminClient
      .from('documents')
      .upsert(documentPayload, {
        onConflict: 'aide_memoire_id,document_format',
      })
      .select('*')
      .single()

    if (documentResult.error) throw documentResult.error

    return jsonResponse({
      ok: true,
      message: existingFile
        ? 'Aide Memoire updated in Google Drive.'
        : 'Aide Memoire uploaded to Google Drive.',
      file: enrichedFile,
      document: documentResult.data,
    })
  } catch (error) {
    console.error(error)

    const rawMessage =
      error instanceof Error ? error.message : 'Unexpected upload error.'
    const status =
      rawMessage === 'PMS10_AUTH_REQUIRED'
        ? 401
        : rawMessage === 'PMS10_UPLOAD_FORBIDDEN'
          ? 403
          : 500
    const publicMessage =
      rawMessage === 'PMS10_AUTH_REQUIRED'
        ? 'Sign in to PMS10 before uploading files.'
        : rawMessage === 'PMS10_UPLOAD_FORBIDDEN'
          ? 'Your current role or assigned area does not allow uploads for this project.'
          : getReadableDriveError(rawMessage)

    return jsonResponse(
      {
        ok: false,
        message: 'Google Drive upload failed.',
        error: publicMessage,
      },
      status,
    )
  }
})
