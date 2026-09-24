import { exportPDF } from "../reports";
import { Wallet, ArrowDownLeft, ArrowUpRight, Search, Download, ChartNoAxesCombined } from "lucide-react";
import { money, digits, download } from "../storage";
export default function ReportsPage({
  search,
  setSearch,
  book,
  setBook,
  currencyBooks,
  type,
  setType,
  period,
  setRange,
  from,
  setPeriod,
  setFrom,
  to,
  setTo,
  data,
  unit,
  balance,
  income,
  expense,
  page,
  months,
  maxChart,
  categoryTotals,
  selected,
  act,
  transactionTable
}) {
  return <>
              <div className="filters no-print">
                <div className="search">
                  <Search size={17} />
                  <input aria-label="Search transactions" placeholder="Search notes, people, categories…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select aria-label="Cashbook filter" value={book} onChange={e => setBook(e.target.value)}>
                  <option value="all">All cashbooks</option>
                  {currencyBooks.map(b => <option value={b.id} key={b.id}>
                      {b.name}
                    </option>)}
                </select>
                <select aria-label="Transaction type" value={type} onChange={e => setType(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expenses</option>
                </select>
                <select aria-label="Report period" value={period} onChange={e => setRange(e.target.value)}>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="all">All time</option>
                  <option value="custom">Custom dates</option>
                </select>
                <input aria-label="Start date" type="date" value={from} onChange={e => {
        setPeriod("custom");
        setFrom(e.target.value);
      }} />
                <input aria-label="End date" type="date" min={from} value={to} onChange={e => {
        setPeriod("custom");
        setTo(e.target.value);
      }} />
              </div>
              <p className="print-only">
                {data.profile.name} · {from || "Beginning"} to {to || "Today"} ·{" "}
                {unit} ·{" "}
                {book === "all" ? "All cashbooks" : data.books.find(b => b.id === book)?.name}
              </p>
              <div className="stats">
                <article className="stat balance">
                  <div>
                    <span>Total balance</span>
                    <Wallet size={20} />
                  </div>
                  <h2>{money(balance, unit)}</h2>
                  <small>All {unit} cashbooks · all time</small>
                  <div className="balance-decoration" />
                </article>
                <article className="stat">
                  <div>
                    <span>Money in</span>
                    <span className="stat-icon income">
                      <ArrowDownLeft size={21} />
                    </span>
                  </div>
                  <h2 className="income">{money(income, unit)}</h2>
                  <small>Income in selected period</small>
                </article>
                <article className="stat">
                  <div>
                    <span>Money out</span>
                    <span className="stat-icon expense">
                      <ArrowUpRight size={21} />
                    </span>
                  </div>
                  <h2 className="expense">{money(expense, unit)}</h2>
                  <small>Expenses in selected period</small>
                </article>
                <article className="stat">
                  <div>
                    <span>Net cash flow</span>
                    <ChartNoAxesCombined size={20} />
                  </div>
                  <h2>{money(income - expense, unit)}</h2>
                  <small>
                    {income ? `${Math.round((income - expense) / income * 100)}% of income retained` : "Your income minus expenses"}
                  </small>
                </article>
              </div>
              {page !== "Transactions" && <div className="charts">
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h3>Cash flow</h3>
                        <p>Last six calendar months · current filters apply</p>
                      </div>
                      <div className="legend">
                        <span className="income">● Income</span>
                        <span className="expense">● Expenses</span>
                      </div>
                    </div>
                    <div className="chart" role="img" aria-label="Monthly income and expense bar chart">
                      {months.map((m, i) => <div className="chart-col" key={i}>
                          <div className="bars">
                            <div className="bar in" style={{
                height: `${m.income / maxChart * 100}%`,
                minHeight: m.income ? 4 : 0
              }} title={`Income ${money(m.income, unit)}`} />
                            <div className="bar out" style={{
                height: `${m.expense / maxChart * 100}%`,
                minHeight: m.expense ? 4 : 0
              }} title={`Expenses ${money(m.expense, unit)}`} />
                          </div>
                          <small>{m.label}</small>
                        </div>)}
                    </div>
                    {!income && !expense && <small>
                        Your cash flow chart grows with each transaction.
                      </small>}
                  </section>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h3>Where it goes</h3>
                        <p>Spending by category</p>
                      </div>
                      <span className="subtle">{unit}</span>
                    </div>
                    {categoryTotals.length ? categoryTotals.slice(0, 5).map((c, i) => <div className="category" key={c.name}>
                          <div>
                            <span>
                              <i style={{
                background: ["#397b64", "#e5ac71", "#8187bf", "#b790b5", "#82b5b0"][i]
              }} />
                              {c.name}
                            </span>
                            <strong>{money(c.total, unit)}</strong>
                          </div>
                          <progress max={expense} value={c.total} />
                        </div>) : <div className="category-empty">
                        <div className="donut">
                          <span>
                            0<small>expenses</small>
                          </span>
                        </div>
                        <p>Your spending story starts here.</p>
                      </div>}
                  </section>
                </div>}
              <section className="card transactions">
                <div className="card-heading">
                  <div>
                    <h3>
                      {page === "Overview" ? "Your transactions" : "Transaction details"}{" "}
                      <span className="badge">{selected.length}</span>
                    </h3>
                    <p>Every entry, a little more clarity.</p>
                  </div>
                  <div className="no-print">
                    <button onClick={() => act(async () => exportPDF(data, selected, unit, from, to))}>
                      <Download size={16} /> Download PDF
                    </button>
                    <button onClick={async () => window.print()}>Print</button>
                    <button onClick={async () => {
            const rows = [["Date", "Cashbook", "Type", "Category", "Note", "Currency", "Amount"], ...selected.map(t => [t.date, data.books.find(b => b.id === t.book)?.name, t.transfer ? `transfer ${t.type === "income" ? "in" : "out"}` : t.type, t.category, t.note, unit, t.amount / 10 ** digits(unit)])];
            download("cashmanage-report.csv", rows.map(r => r.map(v => '"' + String(v).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"').join(",")).join("\r\n"), "text/csv");
          }}>
                      CSV
                    </button>
                  </div>
                </div>
                {transactionTable}
              </section>
            </>;
}
