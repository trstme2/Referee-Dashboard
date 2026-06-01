import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import type { ExpenseCategory } from '../lib/types'
import { upsertExpenseIn, deleteExpenseIn, updateExpenseIn } from '../lib/mutate'
import { formatMoney, safeNumber } from '../lib/utils'
import { createExpenseReceiptSignedUrl, deleteExpenseReceipt, uploadExpenseReceipt } from '../lib/documents'
import { expenseCategoryCaution, IRS_TAX_REVIEW_LINKS, taxReviewFlags } from '../lib/taxReview'

const expenseCategories: ExpenseCategory[] = [
  'Mileage','Gear','Uniform','Dues/Registration',
  'Tolls','Parking','Training','Meals','Lodging','Supplies','Phone/App','Other',
]

export default function ExpensesPage() {
  const { db, write, loading, mode, session } = useData()
  const [form, setForm] = useState({
    id: '',
    expenseDate: '',
    amount: '',
    category: 'Mileage' as ExpenseCategory,
    miles: '',
    vendor: '',
    description: '',
    taxDeductible: 'Yes',
    gameId: '',
    receiptFileName: '',
    notes: '',
  })

  const year = new Date().getFullYear()
  const totals = useMemo(() => {
    const y = String(year)
    const list = db.expenses.filter(e => e.expenseDate.startsWith(y))
    const total = list.reduce((s,e) => s + e.amount, 0)
    const deductible = list.filter(e => e.taxDeductible).reduce((s,e) => s + e.amount, 0)
    const miles = list.filter(e => e.category === 'Mileage').reduce((s,e) => s + (e.miles ?? 0), 0)
    const receipts = list.filter(e => e.receiptFileName || e.receiptStoragePath).length
    return { total, deductible, miles, receipts, count: list.length }
  }, [db.expenses, year])

  const rows = useMemo(() => {
    return [...db.expenses].sort((a,b) => (a.expenseDate < b.expenseDate ? 1 : -1))
  }, [db.expenses])
  const reviewFlagsByExpense = useMemo(() => {
    const flagsByExpense = new Map<string, ReturnType<typeof taxReviewFlags>>()
    for (const flag of taxReviewFlags(db.expenses, db.games)) {
      flagsByExpense.set(flag.expenseId, [...(flagsByExpense.get(flag.expenseId) ?? []), flag])
    }
    return flagsByExpense
  }, [db.expenses, db.games])
  const selectedCategoryCaution = expenseCategoryCaution(form.category)
  const noExpensesYet = db.expenses.length === 0

  function linkedGameLabel(gameId?: string) {
    if (!gameId) return ''
    const game = db.games.find(g => g.id === gameId)
    if (!game) return ''
    const matchup = game.homeTeam && game.awayTeam ? `${game.homeTeam} vs ${game.awayTeam}` : game.locationAddress
    return `${game.gameDate} ${matchup}`
  }

  function expenseTitle(e: typeof rows[number]) {
    return e.description || e.vendor || e.category
  }

  function expenseReviewItems(expenseId: string) {
    const flags = reviewFlagsByExpense.get(expenseId) ?? []
    if (!flags.length) return null
    return (
      <div className="expense-review-flags">
        {flags.map(flag => (
          <span key={flag.id} className="pill warn" title={flag.detail}>{flag.label}</span>
        ))}
      </div>
    )
  }

  function receiptControls(expenseId: string, compact = false) {
    const expense = db.expenses.find(x => x.id === expenseId)
    if (!expense) return null
    return (
      <div className="receipt-actions">
        {expense.receiptFileName ? <span className="pill ok receipt-name">{expense.receiptFileName}</span> : <span className="pill">No receipt</span>}
        {expense.receiptStoragePath ? <button className="btn compact" onClick={() => openReceipt(expense.id)}>Open</button> : null}
        {mode === 'supabase' && session ? (
          <label className={`btn compact receipt-upload-trigger${compact ? ' is-compact' : ''}`}>
            Upload
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={evt => {
                const file = evt.target.files?.[0] ?? null
                void uploadReceipt(expense.id, file)
                evt.currentTarget.value = ''
              }}
            />
          </label>
        ) : null}
        {expense.receiptStoragePath ? <button className="btn compact" onClick={() => removeReceipt(expense.id)}>Remove</button> : null}
      </div>
    )
  }

  function startNew() {
    setForm({
      id: '',
      expenseDate: '',
      amount: '',
      category: 'Mileage',
      miles: '',
      vendor: '',
      description: '',
      taxDeductible: 'Yes',
      gameId: '',
      receiptFileName: '',
      notes: '',
    })
  }

  async function save() {
    if (!form.expenseDate || !form.amount) return
    const next = upsertExpenseIn(db, {
      id: form.id || undefined,
      expenseDate: form.expenseDate,
      amount: safeNumber(form.amount),
      category: form.category,
      miles: form.category === 'Mileage' ? safeNumber(form.miles, 0) : undefined,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
      taxDeductible: form.taxDeductible === 'Yes',
      gameId: form.gameId || undefined,
      notes: form.notes || undefined,
    })
    await write(next)
    startNew()
  }

  function edit(id: string) {
    const e = db.expenses.find(x => x.id === id)
    if (!e) return
    setForm({
      id: e.id,
      expenseDate: e.expenseDate,
      amount: String(e.amount),
      category: e.category,
      miles: e.miles != null ? String(e.miles) : '',
      vendor: e.vendor ?? '',
      description: e.description ?? '',
      taxDeductible: e.taxDeductible ? 'Yes' : 'No',
      gameId: e.gameId ?? '',
      receiptFileName: e.receiptFileName ?? '',
      notes: e.notes ?? '',
    })
  }

  async function del(id: string) {
    const expense = db.expenses.find(x => x.id === id)
    if (!expense) return
    if (!confirm(`Delete this ${expense.category} expense from ${expense.expenseDate}?`)) return
    if (expense?.receiptStoragePath && mode === 'supabase') {
      try {
        await deleteExpenseReceipt(expense.receiptStoragePath)
      } catch (e: any) {
        alert(`Could not delete receipt file: ${String(e?.message ?? e)}`)
        return
      }
    }
    const next = deleteExpenseIn(db, id)
    await write(next)
    if (form.id === id) startNew()
  }

  async function uploadReceipt(expenseId: string, file: File | null) {
    if (!file) return
    if (mode !== 'supabase' || !session?.user?.id) {
      alert('Sign in to upload receipts.')
      return
    }
    const expense = db.expenses.find(x => x.id === expenseId)
    if (!expense) return
    try {
      if (expense.receiptStoragePath) {
        await deleteExpenseReceipt(expense.receiptStoragePath)
      }
      const uploaded = await uploadExpenseReceipt(session.user.id, expenseId, file)
      const next = updateExpenseIn(db, expenseId, {
        receiptStoragePath: uploaded.path,
        receiptFileName: uploaded.fileName,
        receiptMimeType: uploaded.mimeType,
        receiptSizeBytes: uploaded.sizeBytes,
      })
      await write(next)
      if (form.id === expenseId) setForm(prev => ({ ...prev, receiptFileName: uploaded.fileName }))
    } catch (e: any) {
      alert(`Receipt upload failed: ${String(e?.message ?? e)}`)
    }
  }

  async function openReceipt(expenseId: string) {
    const expense = db.expenses.find(x => x.id === expenseId)
    if (!expense?.receiptStoragePath) return
    try {
      const url = await createExpenseReceiptSignedUrl(expense.receiptStoragePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      alert(`Could not open receipt: ${String(e?.message ?? e)}`)
    }
  }

  async function removeReceipt(expenseId: string) {
    const expense = db.expenses.find(x => x.id === expenseId)
    if (!expense) return
    try {
      if (expense.receiptStoragePath && mode === 'supabase') {
        await deleteExpenseReceipt(expense.receiptStoragePath)
      }
      const next = updateExpenseIn(db, expenseId, {
        receiptStoragePath: '',
        receiptFileName: '',
        receiptMimeType: '',
        receiptSizeBytes: undefined,
      })
      await write(next)
      if (form.id === expenseId) setForm(prev => ({ ...prev, receiptFileName: '' }))
    } catch (e: any) {
      alert(`Could not remove receipt: ${String(e?.message ?? e)}`)
    }
  }

  return (
    <div className="grid cols2 expenses-page">
      <section className="card expense-ledger-card">
        <div className="page-section-head">
          <div>
            <h2>Expense Ledger</h2>
            <p className="sub">Track potential business costs, mileage, receipts, and review markers for the current season.</p>
          </div>
          <button className="btn primary" onClick={startNew}>Add expense</button>
        </div>

        <div className="kpi compact-kpi expense-kpi">
          <div className="box">
            <div className="label">{year} expenses</div>
            <div className="value">{formatMoney(totals.total)}</div>
          </div>
          <div className="box">
            <div className="label">Marked for deductible review</div>
            <div className="value">{formatMoney(totals.deductible)}</div>
          </div>
          <div className="box">
            <div className="label">Mileage</div>
            <div className="value">{totals.miles.toFixed(1)} mi</div>
          </div>
          <div className="box">
            <div className="label">Receipts</div>
            <div className="value">{totals.receipts}/{totals.count}</div>
          </div>
        </div>

        <div className="expense-tax-guidance">
          <div>
            <h3>Expense review marker</h3>
            <p>
              The deductible flag is your review marker, never a tax determination. IRS rules generally look for business expenses that are ordinary, necessary, documented, and separated from personal use.
            </p>
            <p>
              Be careful with mixed-use or personal items: season tickets to a local soccer team, fan gear, family meals, and claiming all of home internet because you use a tiny portion for assigning are the kinds of entries worth checking before export.
            </p>
          </div>
          <div className="expense-tax-links">
            {IRS_TAX_REVIEW_LINKS.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            ))}
          </div>
        </div>

        <div className="expense-card-list">
          {rows.map(e => (
            <article key={e.id} className="expense-card">
              <div className="expense-card-head">
                <div>
                  <div className="expense-date">{e.expenseDate}</div>
                  <div className="expense-title">{expenseTitle(e)}</div>
                </div>
                <div className="expense-amount">{formatMoney(e.amount)}</div>
              </div>
              <div className="expense-card-meta">
                <span>{e.category}</span>
                <span>{e.taxDeductible ? 'Marked for deductible review' : 'Not marked for deductible review'}</span>
                {e.category === 'Mileage' ? <span>{(e.miles ?? 0).toFixed(1)} mi</span> : null}
                {linkedGameLabel(e.gameId) ? <span>{linkedGameLabel(e.gameId)}</span> : null}
              </div>
              {expenseReviewItems(e.id)}
              {receiptControls(e.id, true)}
              <div className="expense-card-actions">
                <button className="btn compact" onClick={() => edit(e.id)}>Edit</button>
                <button className="btn compact danger" onClick={() => del(e.id)}>Delete</button>
              </div>
            </article>
          ))}
          {rows.length === 0 && (
            <div className="empty-state centered expense-empty-state">
              <h3>No expenses yet</h3>
              <p>Add your first expense to start tracking deductions, mileage, and receipt storage across devices.</p>
              <button className="btn primary" onClick={startNew}>Add your first expense</button>
            </div>
          )}
        </div>

        <div className="table-wrap expense-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Category</th><th>Amount</th><th>Miles</th><th>Details</th><th>Review</th><th>Receipt</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td>{e.expenseDate}</td>
                  <td>
                    <div>{e.category}</div>
                    <div className="small">{e.taxDeductible ? 'Marked for deductible review' : 'Not marked for deductible review'}</div>
                  </td>
                  <td>{formatMoney(e.amount)}</td>
                  <td>{e.category === 'Mileage' ? (e.miles ?? 0).toFixed(1) : ''}</td>
                  <td>
                    <div>{expenseTitle(e)}</div>
                    {linkedGameLabel(e.gameId) ? <div className="small">{linkedGameLabel(e.gameId)}</div> : null}
                  </td>
                  <td>{expenseReviewItems(e.id)}</td>
                  <td>{receiptControls(e.id)}</td>
                  <td>
                    <div className="btnbar expense-row-actions">
                      <button className="btn compact" onClick={() => edit(e.id)}>Edit</button>
                      <button className="btn compact danger" onClick={() => del(e.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    <div className="empty-state centered">
                      <h3>No expenses yet</h3>
                      <p>Add your first expense to start tracking deductions, mileage, and receipt storage across devices.</p>
                      <button className="btn primary" onClick={startNew}>Add your first expense</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card expense-editor-card">
        <h2>{form.id ? 'Edit expense' : 'Add expense'}</h2>
        <p className="sub">{form.id ? 'Update the record, receipt, or review marker.' : 'Capture a cost while the details are still fresh.'}</p>

        <div className="row">
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} />
          </div>
          <div className="field">
            <label>Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g., 42.50"
            />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {selectedCategoryCaution ? <div className="small expense-category-caution">{selectedCategoryCaution}</div> : null}
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Miles (for Mileage category)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.miles}
              onChange={e => setForm({ ...form, miles: e.target.value })}
              disabled={form.category !== 'Mileage'}
              placeholder="e.g., 24.5"
            />
          </div>
          <div className="field">
            <label>Vendor (optional)</label>
            <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="e.g., Shell, Amazon" />
          </div>
          <div className="field">
            <label>Mark for deductible review</label>
            <select value={form.taxDeductible} onChange={e => setForm({ ...form, taxDeductible: e.target.value })}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
            <div className="small">This marker helps you organize records for review. It does not determine whether an expense is deductible. Mixed personal/business costs may need allocation or may not qualify.</div>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Linked game (optional)</label>
            <select value={form.gameId} onChange={e => setForm({ ...form, gameId: e.target.value })}>
              <option value="">(none)</option>
              {db.games.map(g => (
                <option key={g.id} value={g.id}>
                  {g.gameDate} {g.homeTeam && g.awayTeam ? `${g.homeTeam} vs ${g.awayTeam}` : g.locationAddress}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Description (optional)</label>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        {form.id && (
          <div className="field">
            <label>Receipt</label>
            <div className="receipt-editor">
              {form.receiptFileName ? <span className="pill ok">{form.receiptFileName}</span> : <span className="pill">{noExpensesYet ? 'Receipts ready when you are' : 'No receipt uploaded yet'}</span>}
              {mode === 'supabase' && session ? (
                <label className="btn receipt-upload-trigger">
                  Upload receipt
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={evt => {
                      const file = evt.target.files?.[0] ?? null
                      void uploadReceipt(form.id, file)
                      evt.currentTarget.value = ''
                    }}
                    />
                </label>
              ) : <span className="small">Sign in to upload receipts and keep them available across devices.</span>}
              {form.id && db.expenses.find(x => x.id === form.id)?.receiptStoragePath ? (
                <>
                  <button className="btn" onClick={() => openReceipt(form.id)}>Open receipt</button>
                  <button className="btn" onClick={() => removeReceipt(form.id)}>Remove receipt</button>
                </>
              ) : null}
            </div>
          </div>
        )}

        <div className="btnbar">
          <button className="btn primary" onClick={save} disabled={loading || !form.expenseDate || !form.amount}>Save</button>
          <button className="btn" onClick={startNew} disabled={loading}>New</button>
          {form.id ? <button className="btn danger" onClick={() => del(form.id)} disabled={loading}>Delete expense</button> : null}
        </div>
      </section>
    </div>
  )
}
