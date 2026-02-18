import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import type { ExpenseCategory } from '../lib/types'
import { upsertExpenseIn, deleteExpenseIn } from '../lib/mutate'
import { formatMoney, safeNumber } from '../lib/utils'

const categories: ExpenseCategory[] = [
  'Mileage','Gear','Uniform','Dues/Registration',
  'Tolls','Parking','Training','Meals','Lodging','Supplies','Phone/App','Other'
]

export default function ExpensesPage() {
  const { db, write, loading } = useData()
  const [form, setForm] = useState({
    id: '',
    expenseDate: '',
    amount: '',
    category: 'Mileage' as ExpenseCategory,
    miles: '',
    vendor: '',
    description: '',
    taxDeductible: 'Yes',    gameId: '',
    notes: '',
  })

  const year = new Date().getFullYear()
  const totals = useMemo(() => {
    const y = String(year)
    const list = db.expenses.filter(e => e.expenseDate.startsWith(y))
    const total = list.reduce((s,e) => s + e.amount, 0)
    const miles = list.filter(e => e.category === 'Mileage').reduce((s,e) => s + (e.miles ?? 0), 0)
    return { total, miles }
  }, [db.expenses, year])

  const rows = useMemo(() => {
    return [...db.expenses].sort((a,b) => (a.expenseDate < b.expenseDate ? 1 : -1))
  }, [db.expenses])

  function startNew() {
    setForm({
      id: '',
      expenseDate: '',
      amount: '',
      category: 'Mileage',
      miles: '',
      vendor: '',
      description: '',
      taxDeductible: 'Yes',      gameId: '',
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
      taxDeductible: form.taxDeductible === 'Yes',      gameId: form.gameId || undefined,
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
      taxDeductible: e.taxDeductible ? 'Yes' : 'No',      gameId: e.gameId ?? '',
      notes: e.notes ?? '',
    })
  }

  async function del(id: string) {
    const next = deleteExpenseIn(db, id)
    await write(next)
    if (form.id === id) startNew()
  }

  return (
    <div className="grid cols2">
      <section className="card">
        <h2>Expenses</h2>
        <p className="sub">
          This year: <span className="pill ok">{formatMoney(totals.total)}</span> • Mileage: <span className="pill">{totals.miles.toFixed(1)} mi</span>
        </p>

        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Category</th><th>Amount</th><th>Miles</th><th>Description</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td>{e.expenseDate}</td>
                <td>{e.category}</td>
                <td>{formatMoney(e.amount)}</td>
                <td>{e.category === 'Mileage' ? (e.miles ?? 0).toFixed(1) : ''}</td>
                <td>{e.description ?? e.vendor ?? ''}</td>
                <td>
                  <div className="btnbar">
                    <button className="btn" onClick={() => edit(e.id)}>Edit</button>
                    <button className="btn danger" onClick={() => del(e.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="small">No expenses yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{form.id ? 'Edit expense' : 'Add expense'}</h2>

        <div className="field">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="btnbar">
          <button className="btn primary" onClick={save} disabled={loading || !form.expenseDate || !form.amount}>Save</button>
          <button className="btn" onClick={startNew} disabled={loading}>New</button>
        </div>
      </section>
    </div>
  )
}
