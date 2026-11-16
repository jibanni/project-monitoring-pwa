import { offlineDb } from '../lib/offlineDb'
import { supabase } from '../lib/supabase'

export type RemovableProjectItem = {
  kind: 'update' | 'photo' | 'document'
  id: string
  label: string
  generatedAt?: string | null
  aideMemoireId?: string | null
  documentFormat?: string | null
}

export async function removeProjectItem(projectId: string, item: RemovableProjectItem) {
  const { error } = await supabase.rpc('pms10_admin_remove_project_item', {
    p_project_id: projectId,
    p_item_kind: item.kind,
    p_item_id: item.id,
  })
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Project item removal is not enabled on this server yet.'
    : error.message)
}

// Do not remove drafts, unsynced files, or any other generated document.
export async function forgetRemovedDocument(projectId: string, item: RemovableProjectItem) {
  await offlineDb.transaction('rw', offlineDb.aide_memoire_documents, offlineDb.aide_memoires, async () => {
    const files = await offlineDb.aide_memoire_documents.where('project_id').equals(projectId).toArray()
    const matching = files.filter((file) => file.cloud_document_id === item.id)
    await offlineDb.aide_memoire_documents.bulkDelete(matching.map((file) => file.id))

    const record = item.aideMemoireId ? await offlineDb.aide_memoires.get(item.aideMemoireId) : null
    if (record?.project_id !== projectId) return
    const sameGeneration = (a?: string, b?: string | null) => Boolean(a && b && Date.parse(a) === Date.parse(b))
    if (item.documentFormat === 'pdf' && sameGeneration(record.latest_pdf_generated_at, item.generatedAt)) {
      await offlineDb.aide_memoires.update(record.id, {
        latest_pdf_blob: undefined, latest_pdf_file_name: undefined, latest_pdf_generated_at: undefined,
      })
    }
    if (item.documentFormat === 'docx' && sameGeneration(record.latest_docx_generated_at, item.generatedAt)) {
      await offlineDb.aide_memoires.update(record.id, {
        latest_docx_blob: undefined, latest_docx_file_name: undefined, latest_docx_generated_at: undefined,
      })
    }
  })
}
