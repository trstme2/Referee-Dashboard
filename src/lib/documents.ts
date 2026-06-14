import { supabase } from './supabaseClient'

export const REQUIREMENT_EVIDENCE_BUCKET = 'requirement-evidence'
export const EXPENSE_RECEIPT_BUCKET = 'expense-receipts'
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const MAX_FILE_NAME_LENGTH = 180
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export type UploadedEvidence = {
  path: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_FILE_NAME_LENGTH)
  return cleaned || 'upload'
}

function documentMimeType(file: File): string {
  const explicit = String(file.type || '').toLowerCase()
  if (explicit) return explicit
  const extension = String(file.name || '').split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

function assertAllowedDocumentFile(file: File): string {
  if (!file.size) throw new Error('Upload file is empty')
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Upload file must be 10 MB or smaller')
  const mimeType = documentMimeType(file)
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) {
    throw new Error('Upload file must be a PDF, JPEG, PNG, or WebP image')
  }
  return mimeType
}

export async function uploadRequirementEvidence(userId: string, activityId: string, file: File): Promise<UploadedEvidence> {
  if (!supabase) throw new Error('Supabase is not configured')
  const mimeType = assertAllowedDocumentFile(file)
  const path = `${userId}/${activityId}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage
    .from(REQUIREMENT_EVIDENCE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType,
    })
  if (error) throw new Error(error.message)
  return {
    path,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
  }
}

export async function createRequirementEvidenceSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage
    .from(REQUIREMENT_EVIDENCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create signed URL')
  return data.signedUrl
}

export async function deleteRequirementEvidence(path: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.storage
    .from(REQUIREMENT_EVIDENCE_BUCKET)
    .remove([path])
  if (error) throw new Error(error.message)
}

export async function uploadExpenseReceipt(userId: string, expenseId: string, file: File): Promise<UploadedEvidence> {
  if (!supabase) throw new Error('Supabase is not configured')
  const mimeType = assertAllowedDocumentFile(file)
  const path = `${userId}/${expenseId}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage
    .from(EXPENSE_RECEIPT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType,
    })
  if (error) throw new Error(error.message)
  return {
    path,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
  }
}

export async function createExpenseReceiptSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage
    .from(EXPENSE_RECEIPT_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create signed URL')
  return data.signedUrl
}

export async function deleteExpenseReceipt(path: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.storage
    .from(EXPENSE_RECEIPT_BUCKET)
    .remove([path])
  if (error) throw new Error(error.message)
}
