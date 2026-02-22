import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import { formatMoney } from '../lib/utils'

type IncomeBasis = 'cash' | 'accrual'

function csvValue(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const head = columns.map(csvValue).join(',')
  const body = rows.map((r) => columns.map((c) => csvValue(r[c])).join(',')).join('\n')
  return `${head}\n${body}`
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function TaxPage() {
  const { db } = useData()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [basis, setBasis] = useState<IncomeBasis>('cash')
  const [entered1099ByPayor, setEntered1099ByPayor] = useState<Record<string, string>>({})

  const incomeRows = useMemo(() => {
    return db.games
      .filter((g) => g.status !== 'Canceled')
      .filter((g) => (g.gameFee ?? 0) > 0)
      .map((g) => {
        const accrualDate = g.gameDate
        const cashDate = g.paidConfirmed ? (g.paidDate ?? '') : ''
        const incomeDate = basis === 'cash' ? cashDate : accrualDate
        return {
          id: g.id,
          incomeDate,
          gameDate: g.gameDate,
          paidDate: g.paidDate ?? '',
          payor: g.league ?? 'Unknown / Unassigned',
          league: g.league ?? '',
          sport: g.sport,
          competitionLevel: g.competitionLevel,
          homeTeam: g.homeTeam ?? '',
          awayTeam: g.awayTeam ?? '',
          amount: Number(g.gameFee ?? 0),
          paidConfirmed: g.paidConfirmed ? 'Yes' : 'No',
          status: g.status,
        }
      })
      .filter((r) => r.incomeDate.startsWith(year))
      .sort((a, b) => (a.incomeDate < b.incomeDate ? -1 : a.incomeDate > b.incomeDate ? 1 : 0))
  }, [db.games, basis, year])

  const incomeByPayor = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of incomeRows) m.set(r.payor, (m.get(r.payor) ?? 0) + r.amount)
    return [...m.entries()]
      .map(([payor, dashboardIncome]) => ({ payor, dashboardIncome }))
      .sort((a, b) => (a.payor < b.payor ? -1 : 1))
  }, [incomeRows])

  useEffect(() => {
    const next: Record<string, string> = { ...entered1099ByPayor }
    for (const p of incomeByPayor) {
      if (next[p.payor] == null) next[p.payor] = ''
    }
    setEntered1099ByPayor(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeByPayor.map((x) => x.payor).join('|')])

  const mileageRows = useMemo(() => {
    const gameMileage = db.games
      .filter((g) => g.status !== 'Canceled')
      .filter((g) => g.gameDate.startsWith(year))
      .map((g) => ({
        source: 'Game',
        date: g.gameDate,
        refId: g.id,
        description: `${g.sport} ${g.competitionLevel}`,
        miles: Number(g.roundtripMiles ?? (g.distanceMiles != null ? g.distanceMiles * 2 : 0)),
      }))
      .filter((x) => x.miles > 0)

    const expenseMileage = db.expenses
      .filter((e) => e.category === 'Mileage')
      .filter((e) => e.expenseDate.startsWith(year))
      .map((e) => ({
        source: 'Expense',
        date: e.expenseDate,
        refId: e.id,
        description: e.description ?? e.vendor ?? '',
        miles: Number(e.miles ?? 0),
      }))
      .filter((x) => x.miles > 0)

    return [...gameMileage, ...expenseMileage].sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [db.games, db.expenses, year])

  const expenseRows = useMemo(() => {
    return db.expenses
      .filter((e) => e.expenseDate.startsWith(year))
      .map((e) => ({
        id: e.id,
        expenseDate: e.expenseDate,
        category: e.category,
        amount: e.amount,
        vendor: e.vendor ?? '',
        description: e.description ?? '',
        taxDeductible: e.taxDeductible ? 'Yes' : 'No',
        gameId: e.gameId ?? '',
        notes: e.notes ?? '',
      }))
      .sort((a, b) => (a.expenseDate < b.expenseDate ? -1 : 1))
  }, [db.expenses, year])

  const expensesByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of expenseRows) m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
    return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => (a.category < b.category ? -1 : 1))
  }, [expenseRows])

  const totals = useMemo(() => {
    const income = incomeRows.reduce((s, r) => s + r.amount, 0)
    const miles = mileageRows.reduce((s, r) => s + r.miles, 0)
    const expenses = expenseRows.reduce((s, r) => s + r.amount, 0)
    return { income, miles, expenses }
  }, [incomeRows, mileageRows, expenseRows])

  const reconRows = useMemo(() => {
    return incomeByPayor.map((r) => {
      const entered = Number(entered1099ByPayor[r.payor] || 0)
      return {
        payor: r.payor,
        dashboardIncome: r.dashboardIncome,
        entered1099: entered,
        variance: r.dashboardIncome - entered,
      }
    })
  }, [incomeByPayor, entered1099ByPayor])

  function exportIncomeCsv() {
    const csv = toCsv(incomeRows, ['incomeDate', 'gameDate', 'paidDate', 'payor', 'league', 'sport', 'competitionLevel', 'homeTeam', 'awayTeam', 'amount', 'paidConfirmed', 'status', 'id'])
    downloadCsv(`tax-income-${basis}-${year}.csv`, csv)
  }

  function exportMileageCsv() {
    const csv = toCsv(mileageRows, ['source', 'date', 'description', 'miles', 'refId'])
    downloadCsv(`tax-mileage-${year}.csv`, csv)
  }

  function exportExpensesCsv() {
    const csv = toCsv(expenseRows, ['expenseDate', 'category', 'amount', 'vendor', 'description', 'taxDeductible', 'gameId', 'notes', 'id'])
    downloadCsv(`tax-expenses-${year}.csv`, csv)
  }

  function exportReconCsv() {
    const csv = toCsv(reconRows, ['payor', 'dashboardIncome', 'entered1099', 'variance'])
    downloadCsv(`tax-1099-reconciliation-${basis}-${year}.csv`, csv)
  }

  const qualityChecks = useMemo(() => {
    const gamesMissingFee = db.games.filter((g) => g.gameDate.startsWith(year) && g.status !== 'Canceled' && !g.gameFee).length
    const paidMissingDate = db.games.filter((g) => g.gameDate.startsWith(year) && g.paidConfirmed && !g.paidDate).length
    const mileageMissing = db.games.filter((g) => g.gameDate.startsWith(year) && g.status !== 'Canceled' && g.roundtripMiles == null && g.distanceMiles == null).length
    const expenseMissingFields = db.expenses.filter((e) => e.expenseDate.startsWith(year) && (!e.category || !Number.isFinite(e.amount))).length
    return { gamesMissingFee, paidMissingDate, mileageMissing, expenseMissingFields }
  }, [db.games, db.expenses, year])

  return (
    <div className="grid">
      <section className="card">
        <h2>Tax Export</h2>
        <p className="sub">Year-end exports for income, mileage, expenses, and 1099 reconciliation.</p>

        <div className="row">
          <div className="field">
            <label>Tax year</label>
            <input type="number" min={2000} max={2100} step={1} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="field">
            <label>Income basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as IncomeBasis)}>
              <option value="cash">Cash (paid date)</option>
              <option value="accrual">Accrual-ish (game date)</option>
            </select>
          </div>
        </div>

        <div className="kpi">
          <div className="box">
            <div className="label">Income ({basis})</div>
            <div className="value">{formatMoney(totals.income)}</div>
          </div>
          <div className="box">
            <div className="label">Mileage</div>
            <div className="value">{totals.miles.toFixed(1)} mi</div>
          </div>
          <div className="box">
            <div className="label">Expenses</div>
            <div className="value">{formatMoney(totals.expenses)}</div>
          </div>
        </div>

        <div className="btnbar" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={exportIncomeCsv}>Export Income CSV</button>
          <button className="btn" onClick={exportMileageCsv}>Export Mileage CSV</button>
          <button className="btn" onClick={exportExpensesCsv}>Export Expenses CSV</button>
          <button className="btn" onClick={exportReconCsv}>Export 1099 Reconciliation CSV</button>
        </div>
      </section>

      <section className="grid cols2">
        <div className="card">
          <h2>1099 Reconciliation</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Payor</th><th>Dashboard</th><th>1099 entered</th><th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {reconRows.map((r) => (
                <tr key={r.payor}>
                  <td>{r.payor}</td>
                  <td>{formatMoney(r.dashboardIncome)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={entered1099ByPayor[r.payor] ?? ''}
                      onChange={(e) => setEntered1099ByPayor({ ...entered1099ByPayor, [r.payor]: e.target.value })}
                    />
                  </td>
                  <td>
                    <span className={`pill ${r.variance === 0 ? 'ok' : r.variance > 0 ? 'warn' : 'bad'}`}>
                      {formatMoney(r.variance)}
                    </span>
                  </td>
                </tr>
              ))}
              {reconRows.length === 0 && (
                <tr><td colSpan={4} className="small">No income rows for selected year/basis.</td></tr>
              )}
            </tbody>
          </table>
          <div className="footer-note">
            Set payor via game league/assignor for cleaner 1099 matching.
          </div>
        </div>

        <div className="card">
          <h2>Expense Categories</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Category</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              {expensesByCategory.map((r) => (
                <tr key={r.category}>
                  <td>{r.category}</td>
                  <td>{formatMoney(r.amount)}</td>
                </tr>
              ))}
              {expensesByCategory.length === 0 && (
                <tr><td colSpan={2} className="small">No expenses in selected year.</td></tr>
              )}
            </tbody>
          </table>

          <h2 style={{ marginTop: 12 }}>Data Quality Checks</h2>
          <p className="small">
            <span className={`pill ${qualityChecks.gamesMissingFee === 0 ? 'ok' : 'warn'}`}>Games missing fee: {qualityChecks.gamesMissingFee}</span>{' '}
            <span className={`pill ${qualityChecks.paidMissingDate === 0 ? 'ok' : 'warn'}`}>Paid missing date: {qualityChecks.paidMissingDate}</span>{' '}
            <span className={`pill ${qualityChecks.mileageMissing === 0 ? 'ok' : 'warn'}`}>Games missing mileage: {qualityChecks.mileageMissing}</span>{' '}
            <span className={`pill ${qualityChecks.expenseMissingFields === 0 ? 'ok' : 'warn'}`}>Expense issues: {qualityChecks.expenseMissingFields}</span>
          </p>
        </div>
      </section>
    </div>
  )
}
