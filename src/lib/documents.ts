import { supabase } from './supabaseClient'

export const REQUIREMENT_EVIDENCE_BUCKET = 'requirement-evidence'
export const EXPENSE_RECEIPT_BUCKET = 'expense-receipts'

export type UploadedEvidence = {
  path: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-')
}

export async function uploadRequirementEvidence(userId: string, activityId: string, file: File): Promise<UploadedEvidence> {
  if (!supabase) throw new Error('Supabase is not configured')
  const path = `${userId}/${activityId}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage
    .from(REQUIREMENT_EVIDENCE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })
  if (error) throw new Error(error.message)
  return {
    path,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
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
  const path = `${userId}/${expenseId}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage
    .from(EXPENSE_RECEIPT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })
  if (error) throw new Error(error.message)
  return {
    path,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
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
