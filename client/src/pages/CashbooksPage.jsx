import { Wallet, Plus, Pencil } from "lucide-react";
import { money, today } from "../storage";
export default function CashbooksPage({
  setModal,
  data,
  setUnit,
  setBook,
  setPage,
  setRange
}) {
  return <>
              <div className="section-heading">
                <h3>A place for every purpose</h3>
                <button onClick={async () => setModal({
        kind: "book"
      })}>
                  <Plus size={17} />
                  New cashbook
                </button>
              </div>
              <div className="book-grid">
                {data.books.map(b => {
        const ts = data.transactions.filter(t => t.book === b.id);
        const total = ts.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
        const spent = ts.filter(t => t.type === "expense" && !t.transfer && t.date.startsWith(today().slice(0, 7))).reduce((s, t) => s + t.amount, 0);
        return <article className="card book-card" key={b.id}>
                      <div className="card-heading">
                        <span className="book-icon">
                          <Wallet />
                        </span>
                        <button className="icon" aria-label={`Edit ${b.name}`} onClick={async () => setModal({
              kind: "book",
              value: b
            })}>
                          <Pencil size={16} />
                        </button>
                      </div>
                      <span className="eyebrow">{b.kind}</span>
                      <h3>{b.name}</h3>
                      <h2>{money(total, b.currency)}</h2>
                      <p>
                        {b.kind.startsWith("Borrowed") ? "Positive balance = remaining amount to return" : b.kind.startsWith("Lent") ? "Negative balance = amount still owed to you" : `${ts.length} transactions · ${b.currency}`}
                      </p>
                      {b.budget > 0 && <>
                          <progress max={b.budget} value={spent} />
                          <small className={spent > b.budget ? "expense" : ""}>
                            {money(spent, b.currency)} of{" "}
                            {money(b.budget, b.currency)} monthly budget
                          </small>
                        </>}
                      <button onClick={async () => {
            setUnit(b.currency);
            setBook(b.id);
            setPage("Transactions");
            setRange("all");
          }}>
                        View cashbook →
                      </button>
                    </article>;
      })}
              </div>
              <div className="notice">
                Debt books: record borrowed money as income and repayments as
                expenses. Record money lent as an expense and repayments
                received as income. Add a person and due date to track who and
                when.
              </div>
            </>;
}
