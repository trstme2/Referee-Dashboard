import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import { formatMoney } from '../lib/utils'
import HelpTip from '../components/HelpTip'

type IncomeBasis = 'cash' | 'accrual'

const IRS_STANDARD_MILEAGE_RATES: Record<string, number> = {
  '2026': 72.5,
  '2025': 70,
  '2024': 67,
  '2023': 65.5,
}

function suggestedMileageRateCents(year: string): number {
  return IRS_STANDARD_MILEAGE_RATES[year] ?? 72.5
}

function csvValue(v: unknown): string {
  const raw = String(v ?? '')
  const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
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
  const { db, write, loading } = useData()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [basis, setBasis] = useState<IncomeBasis>('cash')
  const [mileageRateCents, setMileageRateCents] = useState(String(db.settings.taxMileageRateCents ?? suggestedMileageRateCents(year)))
  const [entered1099ByPayor, setEntered1099ByPayor] = useState<Record<string, string>>({})

  function changeYear(nextYear: string) {
    setYear(nextYear)
    if (db.settings.taxMileageRateCents == null) {
      setMileageRateCents(String(suggestedMileageRateCents(nextYear)))
    }
  }

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

  const deductibleExpenseRows = useMemo(() => {
    return expenseRows.filter((e) => e.taxDeductible === 'Yes')
  }, [expenseRows])

  const expensesByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of deductibleExpenseRows) m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
    return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => (a.category < b.category ? -1 : 1))
  }, [deductibleExpenseRows])

  const totals = useMemo(() => {
    const income = incomeRows.reduce((s, r) => s + r.amount, 0)
    const miles = mileageRows.reduce((s, r) => s + r.miles, 0)
    const expenses = expenseRows.reduce((s, r) => s + r.amount, 0)
    const deductibleExpenses = deductibleExpenseRows.reduce((s, r) => s + r.amount, 0)
    return { income, miles, expenses, deductibleExpenses }
  }, [incomeRows, mileageRows, expenseRows, deductibleExpenseRows])

  const parsedMileageRateCents = Number(mileageRateCents)
  const mileageRateIsValid = Number.isFinite(parsedMileageRateCents) && parsedMileageRateCents >= 0
  const mileageEstimate = mileageRateIsValid ? (totals.miles * parsedMileageRateCents) / 100 : 0

  const mileageExportRows = useMemo(() => {
    const rate = mileageRateIsValid ? parsedMileageRateCents : 0
    return mileageRows.map((r) => ({
      ...r,
      rateCents: rate,
      estimatedStandardMileageAmount: Number(((r.miles * rate) / 100).toFixed(2)),
    }))
  }, [mileageRows, mileageRateIsValid, parsedMileageRateCents])

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
    const csv = toCsv(mileageExportRows, ['source', 'date', 'description', 'miles', 'rateCents', 'estimatedStandardMileageAmount', 'refId'])
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

  async function saveMileageRate() {
    if (!mileageRateIsValid) {
      alert('Enter a mileage rate of 0 or higher.')
      return
    }
    await write({
      ...db,
      settings: {
        ...db.settings,
        taxMileageRateCents: parsedMileageRateCents,
      },
    })
  }

  const qualityChecks = useMemo(() => {
    const gamesMissingFee = db.games.filter((g) => g.gameDate.startsWith(year) && g.status !== 'Canceled' && !g.gameFee).length
    const paidMissingDate = db.games.filter((g) => g.gameDate.startsWith(year) && g.paidConfirmed && !g.paidDate).length
    const mileageMissing = db.games.filter((g) => g.gameDate.startsWith(year) && g.status !== 'Canceled' && g.roundtripMiles == null && g.distanceMiles == null).length
    const expenseMissingFields = db.expenses.filter((e) => e.expenseDate.startsWith(year) && (!e.category || !Number.isFinite(e.amount))).length
    return { gamesMissingFee, paidMissingDate, mileageMissing, expenseMissingFields }
  }, [db.games, db.expenses, year])

  return (
    <div className="grid tax-page">
      <section className="card">
        <div className="page-section-head">
          <div>
            <h2>Tax Prep Workspace</h2>
            <p className="sub">Organize income, mileage, expenses, and 1099 comparisons before you export records.</p>
          </div>
          <HelpTip title="Tax prep guardrails" className="help-tip-inline">
            <p>Whistle Keeper organizes records you entered. It does not decide what is deductible, choose your tax method, or prepare a return.</p>
            <p>Confirm the right treatment, mileage rate, and filing approach with IRS guidance or a qualified tax professional.</p>
          </HelpTip>
        </div>

        <div className="row">
          <div className="field">
            <label>Tax year</label>
            <input type="number" min={2000} max={2100} step={1} value={year} onChange={(e) => changeYear(e.target.value)} />
          </div>
          <div className="field">
            <label>Income basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as IncomeBasis)}>
              <option value="cash">Cash (paid date)</option>
              <option value="accrual">Game date view</option>
            </select>
            <div className="small">Use the view that matches how you and your preparer review records.</div>
          </div>
          <div className="field">
            <label>Standard mileage rate (cents per mile)</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={mileageRateCents}
              onChange={(e) => setMileageRateCents(e.target.value)}
            />
            <div className="small">
              2026 IRS business rate: 72.5 cents per mile. <a href="https://www.irs.gov/newsroom/irs-sets-2026-business-standard-mileage-rate-at-725-cents-per-mile-up-25-cents" target="_blank" rel="noreferrer">View IRS source</a>.
            </div>
          </div>
        </div>

        <div className="kpi">
          <div className="box">
            <div className="label">Income records ({basis})</div>
            <div className="value">{formatMoney(totals.income)}</div>
          </div>
          <div className="box">
            <div className="label">Miles logged</div>
            <div className="value">{totals.miles.toFixed(1)} mi</div>
          </div>
          <div className="box">
            <div className="label">Mileage amount estimate</div>
            <div className="value">{formatMoney(mileageEstimate)}</div>
          </div>
          <div className="box">
            <div className="label">Expenses marked deductible</div>
            <div className="value">{formatMoney(totals.deductibleExpenses)}</div>
          </div>
          <div className="box">
            <div className="label">All expenses tracked</div>
            <div className="value">{formatMoney(totals.expenses)}</div>
          </div>
        </div>

        <div className="btnbar" style={{ marginTop: 10 }}>
          <button className="btn" onClick={saveMileageRate} disabled={loading || !mileageRateIsValid}>Save Mileage Rate</button>
          <button className="btn primary" onClick={exportIncomeCsv}>Export Income CSV</button>
          <button className="btn" onClick={exportMileageCsv}>Export Mileage CSV</button>
          <button className="btn" onClick={exportExpensesCsv}>Export Expenses CSV</button>
          <button className="btn" onClick={exportReconCsv}>Export 1099 Reconciliation CSV</button>
        </div>

        <div className="footer-note">
          Exports are record summaries for review. Keep receipts, assignment records, payment records, and any notes your preparer asks for.
        </div>
      </section>

      <section className="card">
        <div className="page-section-head">
          <div>
            <h2>Before You Export</h2>
            <p className="sub">These checks look for missing information that can make records harder to reconcile later.</p>
          </div>
        </div>
        <p className="small">
          <span className={`pill ${qualityChecks.gamesMissingFee === 0 ? 'ok' : 'warn'}`}>Games missing fee: {qualityChecks.gamesMissingFee}</span>{' '}
          <span className={`pill ${qualityChecks.paidMissingDate === 0 ? 'ok' : 'warn'}`}>Paid games missing paid date: {qualityChecks.paidMissingDate}</span>{' '}
          <span className={`pill ${qualityChecks.mileageMissing === 0 ? 'ok' : 'warn'}`}>Games missing mileage: {qualityChecks.mileageMissing}</span>{' '}
          <span className={`pill ${qualityChecks.expenseMissingFields === 0 ? 'ok' : 'warn'}`}>Expense issues: {qualityChecks.expenseMissingFields}</span>
        </p>
      </section>

      <section className="grid cols2">
        <div className="card">
          <h2>1099 Reconciliation</h2>
          <p className="sub">Enter the 1099 amount you received from each payor to spot differences against your game records.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Payor</th><th>Whistle Keeper</th><th>1099 entered</th><th>Variance</th>
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
            Variance is a comparison tool only. A difference may mean timing, naming, missing payments, reimbursement handling, or another issue to review.
          </div>
        </div>

        <div className="card">
          <h2>Expense Categories</h2>
          <p className="sub">Totals include expenses you marked deductible. Use the Expenses page to change that flag.</p>
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
                <tr><td colSpan={2} className="small">No deductible expenses marked for selected year.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
