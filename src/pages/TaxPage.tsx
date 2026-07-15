import { useMemo, useState } from 'react'
import { useData } from '../lib/DataContext'
import { formatMoney } from '../lib/utils'
import HelpTip from '../components/HelpTip'
import { IRS_TAX_REVIEW_LINKS, TAX_REVIEW_CHECKLIST_ITEMS, taxReviewFlags } from '../lib/taxReview'
import { recordPlatformEvent } from '../lib/platformEvents'
import { hasSplitMileageRates, mileageRateForDate, mileageRateSummary, suggestedMileageRateCents } from '../lib/mileageRates'

type IncomeBasis = 'cash' | 'accrual'

function incomeBasisLabel(basis: IncomeBasis): string {
  return basis === 'cash' ? 'Paid-date view' : 'Game-date view'
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
  const { db, write, loading, session } = useData()
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
        markedForTaxReview: e.taxDeductible ? 'Yes' : 'No',
        gameId: e.gameId ?? '',
        notes: e.notes ?? '',
      }))
      .sort((a, b) => (a.expenseDate < b.expenseDate ? -1 : 1))
  }, [db.expenses, year])

  const reviewFlags = useMemo(() => {
    return taxReviewFlags(db.expenses, db.games, year)
  }, [db.expenses, db.games, year])

  const reviewChecklistRows = useMemo(() => {
    const flagRows = reviewFlags.map((flag) => {
      const expense = db.expenses.find((item) => item.id === flag.expenseId)
      return {
        type: 'Record prompt',
        expenseDate: flag.expenseDate,
        category: flag.expenseCategory,
        amount: flag.expenseAmount,
        markedForTaxReview: flag.markedForDeductibleReview ? 'Yes' : 'No',
        expenseDescription: expense?.description ?? expense?.vendor ?? '',
        reviewCode: flag.code,
        reviewItem: flag.label,
        reviewDetails: flag.detail,
        expenseId: flag.expenseId,
      }
    })
    const checklistRows = TAX_REVIEW_CHECKLIST_ITEMS.map((item, index) => ({
      type: 'General review',
      expenseDate: '',
      category: '',
      amount: '',
      markedForTaxReview: '',
      expenseDescription: '',
      reviewCode: `general-${index + 1}`,
      reviewItem: 'General tax review',
      reviewDetails: item,
      expenseId: '',
    }))
    return [...flagRows, ...checklistRows]
  }, [reviewFlags, db.expenses])

  const deductibleExpenseRows = useMemo(() => {
    return expenseRows.filter((e) => e.markedForTaxReview === 'Yes')
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
  const mileageRateInputIsValid = Number.isFinite(parsedMileageRateCents) && parsedMileageRateCents >= 0
  const splitMileageRates = hasSplitMileageRates(year)
  const displayedMileageRateCents = splitMileageRates ? String(suggestedMileageRateCents(year)) : mileageRateCents
  const mileageRateIsValid = splitMileageRates || mileageRateInputIsValid
  const mileageRateConfirmed = db.settings.taxMileageRateCents != null
  const mileageRateSummaryText = mileageRateSummary(year)

  const mileageExportRows = useMemo(() => {
    return mileageRows.map((r) => {
      const matchedRate = splitMileageRates ? mileageRateForDate(r.date) : undefined
      const rate = matchedRate?.rateCents ?? (mileageRateInputIsValid ? parsedMileageRateCents : 0)
      return {
        ...r,
        rateCents: rate,
        ratePeriod: splitMileageRates
          ? matchedRate?.label ?? 'No configured rate for this date'
          : 'Saved flat rate',
        estimatedStandardMileageAmount: Number(((r.miles * rate) / 100).toFixed(2)),
      }
    })
  }, [mileageRows, mileageRateInputIsValid, parsedMileageRateCents, splitMileageRates])

  const mileageEstimate = useMemo(() => {
    return mileageExportRows.reduce((sum, row) => sum + row.estimatedStandardMileageAmount, 0)
  }, [mileageExportRows])

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
    void recordPlatformEvent(session?.access_token, 'tax_export_downloaded', { exportType: 'income', year, basis, rowCount: incomeRows.length })
  }

  function exportMileageCsv() {
    const csv = toCsv(mileageExportRows, ['source', 'date', 'description', 'miles', 'rateCents', 'ratePeriod', 'estimatedStandardMileageAmount', 'refId'])
    downloadCsv(`tax-mileage-${year}.csv`, csv)
    void recordPlatformEvent(session?.access_token, 'tax_export_downloaded', { exportType: 'mileage', year, rowCount: mileageExportRows.length })
  }

  function exportExpensesCsv() {
    const csv = toCsv(expenseRows, ['expenseDate', 'category', 'amount', 'vendor', 'description', 'markedForTaxReview', 'gameId', 'notes', 'id'])
    downloadCsv(`tax-expenses-${year}.csv`, csv)
    void recordPlatformEvent(session?.access_token, 'tax_export_downloaded', { exportType: 'expenses', year, rowCount: expenseRows.length })
  }

  function exportReconCsv() {
    const csv = toCsv(reconRows, ['payor', 'dashboardIncome', 'entered1099', 'variance'])
    downloadCsv(`tax-1099-reconciliation-${basis}-${year}.csv`, csv)
    void recordPlatformEvent(session?.access_token, 'tax_export_downloaded', { exportType: 'reconciliation', year, basis, rowCount: reconRows.length })
  }

  function exportReviewChecklistCsv() {
    const csv = toCsv(reviewChecklistRows, ['type', 'expenseDate', 'category', 'amount', 'markedForTaxReview', 'expenseDescription', 'reviewCode', 'reviewItem', 'reviewDetails', 'expenseId'])
    downloadCsv(`tax-export-review-checklist-${year}.csv`, csv)
    void recordPlatformEvent(session?.access_token, 'tax_export_downloaded', { exportType: 'review_checklist', year, rowCount: reviewChecklistRows.length })
  }

  async function saveMileageRate() {
    if (!mileageRateIsValid) {
      alert('Enter a mileage rate of 0 or higher.')
      return
    }
    const rateToSave = splitMileageRates ? suggestedMileageRateCents(year) : parsedMileageRateCents
    await write({
      ...db,
      settings: {
        ...db.settings,
        taxMileageRateCents: rateToSave,
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
  const exportReadiness = useMemo(() => {
    const blockers = qualityChecks.paidMissingDate + qualityChecks.expenseMissingFields
    const reviewItems = reviewFlags.length + qualityChecks.gamesMissingFee + qualityChecks.mileageMissing
    if (blockers > 0) return { tone: 'bad', label: 'Record gaps found', detail: `${blockers} blocker${blockers === 1 ? '' : 's'} and ${reviewItems} review item${reviewItems === 1 ? '' : 's'} found in app records.` }
    if (reviewItems > 0) return { tone: 'warn', label: 'Review notes found', detail: `${reviewItems} review item${reviewItems === 1 ? '' : 's'} should be checked or discussed with your preparer before relying on exports.` }
    return { tone: 'ok', label: 'No app-detected record gaps', detail: 'Whistle Keeper did not find missing paid dates, expense field issues, mileage gaps, fee gaps, or app review prompts for this year.' }
  }, [qualityChecks, reviewFlags.length])

  return (
    <div className="grid tax-page">
      <section className="card">
        <div className="page-section-head">
          <div>
            <h2>Tax Record Workspace</h2>
            <p className="sub">Organize income, mileage, expenses, and 1099 comparisons before you export records.</p>
          </div>
          <HelpTip title="Tax-time guardrails" className="help-tip-inline">
            <p>Whistle Keeper organizes records you entered and estimates amounts from those records. It does not prepare a return, decide deductibility, choose a filing method, or determine worker classification.</p>
            <p>Confirm mileage treatment, reimbursement handling, worker status, and filing approach with IRS guidance or a qualified tax professional.</p>
          </HelpTip>
        </div>

        <div className="row">
          <div className="field">
            <label>Tax year</label>
            <input type="number" min={2000} max={2100} step={1} value={year} onChange={(e) => changeYear(e.target.value)} />
          </div>
          <div className="field">
            <label>Income view</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as IncomeBasis)}>
              <option value="cash">Paid-date view</option>
              <option value="accrual">Game-date view</option>
            </select>
            <div className="small">Use the view that matches how you and your preparer review records.</div>
          </div>
          <div className="field">
            <label>{splitMileageRates ? 'Mileage rates by date' : 'Standard mileage rate (cents per mile)'}</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={displayedMileageRateCents}
              onChange={(e) => {
                if (!splitMileageRates) setMileageRateCents(e.target.value)
              }}
              disabled={splitMileageRates}
            />
            <div className="small">
              {mileageRateSummaryText} {splitMileageRates ? 'Whistle Keeper applies the rate by mileage date in the mileage estimate and CSV export. ' : ''}
              Verify the rate and whether your miles can be used before relying on an export. <a href="https://www.irs.gov/publications/p463" target="_blank" rel="noreferrer">Review IRS mileage guidance</a>.
            </div>
            <div className="small">
              {mileageRateConfirmed
                ? splitMileageRates ? 'Date-based mileage rates confirmed for this record set.' : 'Mileage rate saved for this record set.'
                : splitMileageRates ? 'Review and confirm these date-based rates once to complete tax record setup.' : 'Review this rate and save it once to complete tax record setup.'}
            </div>
          </div>
        </div>

        <div className="kpi">
          <div className="box">
            <div className="label">Income records ({incomeBasisLabel(basis)})</div>
            <div className="value">{formatMoney(totals.income)}</div>
          </div>
          <div className="box">
            <div className="label">Miles logged</div>
            <div className="value">{totals.miles.toFixed(1)} mi</div>
          </div>
          <div className="box">
            <div className="label">Mileage calculation estimate</div>
            <div className="value">{formatMoney(mileageEstimate)}</div>
          </div>
          <div className="box">
            <div className="label">Marked for tax review</div>
            <div className="value">{formatMoney(totals.deductibleExpenses)}</div>
          </div>
          <div className="box">
            <div className="label">All expenses tracked</div>
            <div className="value">{formatMoney(totals.expenses)}</div>
          </div>
        </div>

        <div className="btnbar" style={{ marginTop: 10 }}>
          <button className="btn" onClick={saveMileageRate} disabled={loading || !mileageRateIsValid}>{splitMileageRates ? 'Confirm date-based rates' : mileageRateConfirmed ? 'Update mileage rate' : 'Save mileage rate'}</button>
          <button className="btn primary" onClick={exportIncomeCsv}>Export Income CSV</button>
          <button className="btn" onClick={exportMileageCsv}>Export Mileage CSV</button>
          <button className="btn" onClick={exportExpensesCsv}>Export Expenses CSV</button>
          <button className="btn" onClick={exportReconCsv}>Export 1099 Reconciliation CSV</button>
          <button className="btn" onClick={exportReviewChecklistCsv}>Export Review Checklist CSV</button>
        </div>

        <div className="footer-note">
          Exports are record summaries for review. Keep receipts, assignment records, payment records, reimbursement details, and any notes your preparer asks for.
        </div>
        {!mileageRateConfirmed ? (
          <p className="small"><span className="pill warn">Tax record setup stays incomplete until you save the mileage rate for the year you are preparing.</span></p>
        ) : null}
      </section>

      <section className="card tax-confidence-card">
        <div className="page-section-head">
          <div>
            <h2>Record Completeness Check</h2>
            <p className="sub">A field-level check before you hand records to tax software or a preparer.</p>
          </div>
          <span className={`pill ${exportReadiness.tone}`}>{exportReadiness.label}</span>
        </div>
        <div className="tax-confidence-grid">
          <div>
            <div className="expanded-label">Record summary</div>
            <p>{exportReadiness.detail}</p>
          </div>
          <div>
            <div className="expanded-label">Recommended handoff</div>
            <p>Export income, mileage, expenses, 1099 reconciliation, and the review checklist together. The checklist is your cover sheet for unresolved questions.</p>
          </div>
          <div>
            <div className="expanded-label">App boundary</div>
            <p>Whistle Keeper organizes records and highlights review prompts. It does not decide deductibility, tax method, worker classification, mileage eligibility, or filing treatment.</p>
          </div>
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

      <section className="card tax-review-queue">
        <div className="page-section-head">
          <div>
            <h2>Export Review Queue</h2>
            <p className="sub">Resolve or discuss these record-level prompts before relying on an export. They are review reminders, not tax determinations.</p>
          </div>
          <span className={`pill ${reviewFlags.length === 0 ? 'ok' : 'warn'}`}>{reviewFlags.length} review item{reviewFlags.length === 1 ? '' : 's'}</span>
        </div>
        <div className="tax-review-mobile-list">
          {reviewFlags.map((flag) => (
            <article key={flag.id} className="tax-mobile-card">
              <div className="tax-mobile-card-head">
                <div>
                  <strong>{flag.label}</strong>
                  <span>{flag.expenseDate} | {flag.expenseCategory}</span>
                </div>
                <span className="pill warn">{formatMoney(flag.expenseAmount)}</span>
              </div>
              <p>{flag.detail}</p>
            </article>
          ))}
          {reviewFlags.length === 0 ? (
            <div className="empty-state centered">
              <h3>No review items found</h3>
              <p>No expense review prompts were found for the selected year.</p>
            </div>
          ) : null}
        </div>
        <div className="table-wrap tax-review-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Category</th><th>Amount</th><th>Review item</th><th>Details</th>
              </tr>
            </thead>
            <tbody>
              {reviewFlags.map((flag) => (
                <tr key={flag.id}>
                  <td>{flag.expenseDate}</td>
                  <td>{flag.expenseCategory}</td>
                  <td>{formatMoney(flag.expenseAmount)}</td>
                  <td><span className="pill warn">{flag.label}</span></td>
                  <td className="small">{flag.detail}</td>
                </tr>
              ))}
              {reviewFlags.length === 0 && (
                <tr><td colSpan={5} className="small">No computed expense review items for the selected year.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="tax-review-links">
          {IRS_TAX_REVIEW_LINKS.map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
          ))}
        </div>
        <div className="footer-note">
          The review checklist export also includes general prompts for worker status, reimbursements, home-to-work mileage, vehicle expense method, mixed-use expenses, meals, lodging, and record retention.
        </div>
      </section>

      <section className="grid cols2 tax-secondary-grid">
        <div className="card">
          <h2>1099 Reconciliation</h2>
          <p className="sub">Enter the 1099 amount you received from each payor to spot differences against your game records.</p>
          <div className="tax-recon-mobile-list">
            {reconRows.map((r) => (
              <article key={r.payor} className="tax-mobile-card">
                <div className="tax-mobile-card-head">
                  <div>
                    <strong>{r.payor}</strong>
                    <span>Whistle Keeper: {formatMoney(r.dashboardIncome)}</span>
                  </div>
                  <span className={`pill ${r.variance === 0 ? 'ok' : r.variance > 0 ? 'warn' : 'bad'}`}>{formatMoney(r.variance)}</span>
                </div>
                <div className="field">
                  <label>1099 entered</label>
                  <input
                    type="number"
                    step="0.01"
                    value={entered1099ByPayor[r.payor] ?? ''}
                    onChange={(e) => setEntered1099ByPayor({ ...entered1099ByPayor, [r.payor]: e.target.value })}
                  />
                </div>
              </article>
            ))}
            {reconRows.length === 0 ? (
              <div className="empty-state">
                <h3>No income rows</h3>
                <p>No income rows match the selected year and basis.</p>
              </div>
            ) : null}
          </div>
          <table className="table tax-recon-table">
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
          <p className="sub">Totals include expenses you marked for tax review. Use the Expenses page to change that marker.</p>
          <div className="tax-category-mobile-list">
            {expensesByCategory.map((r) => (
              <article key={r.category} className="tax-mobile-card is-compact">
                <strong>{r.category}</strong>
                <span>{formatMoney(r.amount)}</span>
              </article>
            ))}
            {expensesByCategory.length === 0 ? (
              <div className="empty-state">
                <h3>No category totals</h3>
                <p>No expenses are marked for tax review for the selected year.</p>
              </div>
            ) : null}
          </div>
          <table className="table tax-category-table">
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
                <tr><td colSpan={2} className="small">No expenses marked for tax review for the selected year.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
