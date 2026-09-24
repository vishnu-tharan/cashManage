import { confirmAction } from "../dialogs";
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Pencil } from "lucide-react";
import { money } from "../storage";
export default function TransactionTable({
  selected,
  data,
  unit,
  setModal,
  busy,
  act,
  save
}) {
  return <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Cashbook</th>
            <th>Date</th>
            <th>Amount</th>
            <th className="no-print">Actions</th>
          </tr>
        </thead>
        <tbody>
          {selected.map(t => <tr key={t.id}>
              <td>
                <div className="transaction-name">
                  <span className={`transaction-icon ${t.type}`}>
                    {t.type === "income" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
                  </span>
                  <div>
                    <strong>{t.note || t.category}</strong>
                    <small>
                      {t.category}
                      {t.person && ` · ${t.person}`}
                      {t.due && ` · Due ${t.due}`}
                    </small>
                  </div>
                </div>
              </td>
              <td>{data.books.find(b => b.id === t.book)?.name}</td>
              <td>{t.date}</td>
              <td className={t.type}>
                {t.type === "income" ? "+" : "−"}
                {money(t.amount, unit)}
              </td>
              <td className="no-print">
                <button disabled={!!t.transfer || !!t.debt} aria-label={`Edit ${t.note || t.category}`} className="icon" onClick={async () => setModal({
              kind: "transaction",
              value: t
            })}>
                  <Pencil size={15} />
                </button>
                <button aria-label={`Delete ${t.note || t.category}`} className="icon" disabled={busy || !!t.debt} onClick={async () => (await confirmAction(t.transfer ? "Delete both sides of this wallet transfer?" : "Delete this transaction? You can restore it from Import & history.")) && act(() => save({
              ...data,
              transactions: data.transactions.filter(x => t.transfer ? x.transfer !== t.transfer : x.id !== t.id)
            }))}>
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>)}
        </tbody>
      </table>
      {!selected.length && <div className="empty">
          <div className="empty-icon">
            <ArrowDownLeft />
          </div>
          <h3>A fresh page for your money</h3>
          <p>
            No transactions match this view. Add your first entry or adjust the
            filters.
          </p>
          <button onClick={async () => setModal({
        kind: "transaction"
      })}>
            <Plus size={16} /> Add transaction
          </button>
        </div>}
    </div>;
}
