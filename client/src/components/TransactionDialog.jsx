import { X } from "lucide-react";
import { digits, currencies, today } from "../storage";
import { categories, kinds } from "../domain/constants.js";
import { Field } from "../components/forms";
export default function TransactionDialog({
  setModal,
  modal,
  act,
  save,
  data,
  unit,
  book,
  busy,
  message
}) {
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="modal">
            <div className="card-heading">
              <h2 id="modal-title">
                {modal.value ? "Edit" : "New"}{" "}
                {modal.kind === "book" ? "cashbook" : "transaction"}
              </h2>
              <button aria-label="Close dialog" className="icon" onClick={async () => setModal(null)}>
                <X />
              </button>
            </div>
            <form onSubmit={e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        act(async () => {
          if (modal.kind === "book") {
            const value = {
              ...f,
              id: modal.value?.id || crypto.randomUUID(),
              budget: Math.round(Number(f.budget || 0) * 10 ** digits(f.currency))
            };
            await save({
              ...data,
              books: modal.value ? data.books.map(b => b.id === value.id ? value : b) : [...data.books, value]
            });
          } else {
            const b = data.books.find(b => b.id === f.book);
            const amount = Math.round(Number(f.amount) * 10 ** digits(b.currency));
            if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Enter a valid positive amount");
            const value = {
              ...modal.value,
              ...f,
              amount,
              id: modal.value?.id || crypto.randomUUID()
            };
            await save({
              ...data,
              transactions: modal.value ? data.transactions.map(t => t.id === value.id ? value : t) : [...data.transactions, value]
            });
          }
          setModal(null);
        });
      }}>
              {modal.kind === "book" ? <>
                  <Field label="Cashbook name">
                    <input autoFocus name="name" required maxLength={50} defaultValue={modal.value?.name} />
                  </Field>
                  <Field label="Purpose">
                    <select name="kind" defaultValue={modal.value?.kind}>
                      {kinds.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Currency (fixed after creation)">
                    <select name="currency" defaultValue={modal.value?.currency || unit}>
                      {(modal.value ? [modal.value.currency] : currencies).map(c => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Monthly expense budget (0 = no budget)">
                    <input type="number" name="budget" min="0" max="1000000000" step="0.01" defaultValue={modal.value ? modal.value.budget / 10 ** digits(modal.value.currency) : 0} />
                  </Field>
                </> : <>
                  <div className="form-row">
                    <Field label="Type">
                      <select name="type" defaultValue={modal.value?.type || "expense"}>
                        <option value="income">Income (+)</option>
                        <option value="expense">Expense (−)</option>
                      </select>
                    </Field>
                    <Field label="Cashbook">
                      <select name="book" defaultValue={modal.value?.book || (book !== "all" ? book : data.books[0].id)}>
                        {data.books.map(b => <option key={b.id} value={b.id}>
                            {b.name} ({b.currency})
                          </option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="form-row">
                    <Field label="Amount">
                      <input autoFocus name="amount" required type="number" min="0.01" max="1000000000" step="0.01" defaultValue={modal.value ? modal.value.amount / 10 ** digits(data.books.find(b => b.id === modal.value.book).currency) : ""} />
                    </Field>
                    <Field label="Date">
                      <input name="date" type="date" required defaultValue={modal.value?.date || today()} />
                    </Field>
                  </div>
                  <Field label="Category">
                    <select name="category" defaultValue={modal.value?.category}>
                      {categories.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Description">
                    <input name="note" maxLength={200} placeholder="What was it for?" defaultValue={modal.value?.note} />
                  </Field>
                  <div className="form-row">
                    <Field label="Person (optional)">
                      <input name="person" maxLength={80} defaultValue={modal.value?.person} />
                    </Field>
                    <Field label="Due date (optional)">
                      <input name="due" type="date" defaultValue={modal.value?.due} />
                    </Field>
                  </div>
                </>}
              <button className="primary wide" disabled={busy}>
                {busy ? "Saving…" : "Save " + modal.kind}
              </button>
              {message && <p role="alert">{message}</p>}
            </form>
          </section>
        </div>;
}
