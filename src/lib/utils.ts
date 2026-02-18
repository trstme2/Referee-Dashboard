export function yyyyMmDd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
export function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
export function addDays(d: Date, days: number): Date { const x = new Date(d); x.setDate(x.getDate() + days); return x }
export function toISOFromDateTime(date: string, time?: string): string {
  if (!time) return new Date(`${date}T00:00:00`).toISOString()
  return new Date(`${date}T${time}:00`).toISOString()
}
export function safeNumber(x: any, fallback = 0): number {
  const n = typeof x === 'number' ? x : Number(String(x ?? '').trim())
  return Number.isFinite(n) ? n : fallback
}
export function normalizeHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}
export function isWithinNextDays(dateYmd: string, days: number): boolean {
  const now = new Date()
  const target = new Date(`${dateYmd}T00:00:00`)
  const diff = (target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= days
}
