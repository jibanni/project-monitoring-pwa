import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  aideMemoireDocumentToBlob,
  getLatestAideMemoireDocument,
  offlineDb,
  type OfflineAideMemoireDocument,
} from '../lib/offlineDb'
import '../styles/aideMemoirePdfViewer.css'

function getSafeReturnPath(
  projectId: string,
  requestedReturnTo: string | null,
  source: string | null,
) {
  const defaultPath = source === 'update'
    ? `/projects/${projectId}/updates`
    : `/projects/${projectId}`

  if (!requestedReturnTo) return defaultPath

  const decoded = (() => {
    try {
      return decodeURIComponent(requestedReturnTo)
    } catch {
      return requestedReturnTo
    }
  })()

  if (
    decoded === `/projects/${projectId}` ||
    decoded === `/projects/${projectId}/updates`
  ) {
    return decoded
  }

  return defaultPath
}

export default function AideMemoirePdfViewer() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [documentRecord, setDocumentRecord] = useState<OfflineAideMemoireDocument | null>(null)
  const [objectUrl, setObjectUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)

  const documentId = searchParams.get('documentId')
  const source = searchParams.get('from')
  const returnPath = useMemo(
    () => getSafeReturnPath(id, searchParams.get('returnTo'), source),
    [id, searchParams, source],
  )
  const backLabel = source === 'update' ? 'Back to Project Update' : 'Back to Project Details'

  useEffect(() => {
    if (!id) {
      setError('The project reference is missing.')
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadDocument() {
      setLoading(true)
      setError('')

      try {
        let stored: OfflineAideMemoireDocument | null = null

        if (documentId) {
          stored = (await offlineDb.aide_memoire_documents.get(documentId)) || null
        }

        if (!stored) {
          stored = await getLatestAideMemoireDocument(id, 'pdf')
        }

        if (!stored || stored.format !== 'pdf' || String(stored.project_id) !== String(id)) {
          throw new Error('The latest Aide Memoire PDF is not available on this device.')
        }

        if (!cancelled) setDocumentRecord(stored)
      } catch (loadError: any) {
        if (!cancelled) {
          setDocumentRecord(null)
          setError(loadError?.message || 'Unable to open the Aide Memoire PDF.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDocument()

    return () => {
      cancelled = true
    }
  }, [documentId, id])

  useEffect(() => {
    if (!documentRecord) {
      setObjectUrl('')
      return
    }

    const url = URL.createObjectURL(aideMemoireDocumentToBlob(documentRecord))
    setObjectUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [documentRecord])

  function goBack() {
    navigate(returnPath, { replace: true })
  }

  async function sharePdf() {
    if (!documentRecord) return

    const blob = aideMemoireDocumentToBlob(documentRecord)
    const file = new File(
      [blob],
      documentRecord.file_name || 'Aide_Memoire.pdf',
      { type: documentRecord.mime_type || 'application/pdf' },
    )

    const shareData: ShareData = {
      title: 'Aide Memoire',
      files: [file],
    }

    if (!navigator.share || (navigator.canShare && !navigator.canShare(shareData))) {
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      return
    }

    setSharing(true)
    try {
      await navigator.share(shareData)
    } catch (shareError: any) {
      if (shareError?.name !== 'AbortError') {
        console.error('Unable to share the Aide Memoire PDF.', shareError)
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <main className="am-pdf-viewer-page">
      <header className="am-pdf-viewer-toolbar">
        <button type="button" className="am-pdf-viewer-back" onClick={goBack}>
          <span aria-hidden="true">←</span>
          <span>{backLabel}</span>
        </button>

        <div className="am-pdf-viewer-heading">
          <small>Latest Aide Memoire</small>
          <strong>{documentRecord?.file_name || 'Aide Memoire PDF'}</strong>
        </div>

        <button
          type="button"
          className="am-pdf-viewer-share"
          onClick={() => void sharePdf()}
          disabled={!documentRecord || !objectUrl || sharing}
        >
          {sharing ? 'Opening…' : 'Share / Save'}
        </button>
      </header>

      <section className="am-pdf-viewer-content" aria-live="polite">
        {loading ? (
          <div className="am-pdf-viewer-state">
            <span className="am-pdf-viewer-spinner" />
            <strong>Opening the latest PDF…</strong>
            <small>The file is being loaded from this device.</small>
          </div>
        ) : error ? (
          <div className="am-pdf-viewer-state is-error">
            <strong>PDF unavailable</strong>
            <p>{error}</p>
            <button type="button" onClick={goBack}>{backLabel}</button>
          </div>
        ) : objectUrl ? (
          <iframe
            className="am-pdf-viewer-frame"
            src={objectUrl}
            title={documentRecord?.file_name || 'Aide Memoire PDF'}
          />
        ) : null}
      </section>
    </main>
  )
}
