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
  }
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

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
}

function base64UrlEncode(input: string | ArrayBuffer) {
  let binary = ''

  if (typeof input === 'string') {
    binary = input
  } else {
    const bytes = new Uint8Array(input)
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function pemToArrayBuffer(pem: string) {
  const normalizedPem = pem.replace(/\\n/g, '\n')

  const base64 = normalizedPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

async function createGoogleJwt(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedClaim = base64UrlEncode(JSON.stringify(claim))
  const unsignedJwt = `${encodedHeader}.${encodedClaim}`

  const keyData = pemToArrayBuffer(privateKey)

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedJwt),
  )

  return `${unsignedJwt}.${base64UrlEncode(signature)}`
}

async function getGoogleAccessToken() {
  const clientEmail = getRequiredEnv('GOOGLE_CLIENT_EMAIL')
  const privateKey = getRequiredEnv('GOOGLE_PRIVATE_KEY')

  const jwt = await createGoogleJwt(clientEmail, privateKey)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('Google OAuth error:', data)
    throw new Error(
      data.error_description ||
        data.error ||
        'Unable to get Google access token.',
    )
  }

  return data.access_token as string
}

async function uploadFileToGoogleDrive(params: {
  accessToken: string
  folderId: string
  file: File
  fileName: string
  projectId: string
  updateId: string
  projectTitle: string
  uploadedBy: string
}) {
  const {
    accessToken,
    folderId,
    file,
    fileName,
    projectId,
    updateId,
    projectTitle,
    uploadedBy,
  } = params

  const metadata = {
    name: fileName,
    parents: [folderId],
    description: [
      'PMS10 Project Update Photo',
      projectTitle ? `Project: ${projectTitle}` : '',
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
      uploadedBy,
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

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(
      fields,
    )}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )

  const data = await response.json()

  if (!response.ok) {
    console.error('Google Drive upload error:', data)
    throw new Error(
      data.error?.message || 'Unable to upload file to Google Drive.',
    )
  }

  return data as {
    id: string
    name: string
    mimeType: string
    size?: string
    webViewLink?: string
    webContentLink?: string
    thumbnailLink?: string
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
    const folderId = getRequiredEnv('GOOGLE_DRIVE_FOLDER_ID')

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

    const projectId = String(formData.get('projectId') || '')
    const updateId = String(formData.get('updateId') || '')
    const projectTitle = String(formData.get('projectTitle') || '')
    const uploadedBy = String(formData.get('uploadedBy') || '')

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

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '')

    const cleanProjectTitle = sanitizeFileName(
      projectTitle || projectId || 'project',
    )
    const cleanOriginalName = sanitizeFileName(file.name || 'photo.jpg')

    const fileName = `${cleanProjectTitle}_${timestamp}_${cleanOriginalName}`

    const accessToken = await getGoogleAccessToken()

    const uploadedFile = await uploadFileToGoogleDrive({
      accessToken,
      folderId,
      file,
      fileName,
      projectId,
      updateId,
      projectTitle,
      uploadedBy,
    })

    return jsonResponse({
      ok: true,
      message: 'Photo uploaded to Google Drive.',
      file: uploadedFile,
    })
  } catch (error) {
    console.error(error)

    return jsonResponse(
      {
        ok: false,
        message: 'Google Drive upload failed.',
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected upload error.',
      },
      500,
    )
  }
})
