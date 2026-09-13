import { ask } from "./dialogs";
import { useState } from "react";
import {
  api,
  derive,
  seal,
  unseal,
  randomSalt,
  initial,
  money,
  today,
  currencies,
} from "./storage";
import { amountOf, uid } from "./ledger";
export default function SharedBooks({ session, act }) {
  const [list, setList] = useState([]),
    [opened, setOpened] = useState(null);
  const refresh = async () => setList(await api("/shared"));
  return (
    <section className="card">
      <h3>Shared cashbooks</h3>
      <p>
        Online collaboration with owner, editor and viewer permissions. Share
        the book passphrase privately with members. Never reuse your account
        password.
      </p>
      <button disabled={session.guest} onClick={() => act(refresh)}>
        Load shared books
      </button>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          act(async () => {
            const salt = randomSalt(),
              key = await derive(f.password, salt),
              data = initial(f.name);
            data.books = [
              { ...data.books[0], name: f.name, currency: f.currency },
            ];
            data.profile.currency = f.currency;
            await api("/shared", "POST", {
              name: f.name,
              vault: await seal(data, key, salt),
            });
            e.target.reset();
            await refresh();
          });
        }}
      >
        <input
          name="name"
          aria-label="Shared book name"
          placeholder="Family spending"
          maxLength={50}
          required
        />
        <input
          name="password"
          aria-label="Shared book passphrase"
          type="password"
          placeholder="Separate shared passphrase"
          minLength={12}
          required
        />
        <select name="currency" aria-label="Shared book currency">
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button disabled={session.guest}>Create shared book</button>
      </form>
      {list.map((b) => (
        <div className="rate" key={b.id}>
          <span>
            {b.name} · {b.role}
          </span>
          <button
            onClick={() =>
              act(async () => {
                const password = await ask("Shared book passphrase:");
                if (!password) return;
                const r = await api(`/shared/${b.id}`),
                  key = await derive(password, r.vault.salt);
                setOpened({ ...r, key, data: await unseal(r.vault, key) });
              })
            }
          >
            Unlock
          </button>
        </div>
      ))}
      {opened && (
        <div className="shared-content">
          <div className="section-heading">
            <h3>
              {opened.name} · {opened.role}
            </h3>
            <button onClick={() => setOpened(null)}>Lock shared book</button>
          </div>
          <p>
            Currency: {opened.data.books[0].currency}. Shared entries are
            separate from your private cashbooks.
          </p>
          {opened.data.transactions.map((t) => (
            <div className="rate" key={t.id}>
              <span>
                {t.date} · {t.note}
              </span>
              <strong className={t.type}>
                {t.type === "income" ? "+" : "−"}
                {money(t.amount, opened.data.books[0].currency)}
              </strong>
            </div>
          ))}
          {opened.role !== "viewer" && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.target));
                act(async () => {
                  const data = {
                    ...opened.data,
                    transactions: [
                      ...opened.data.transactions,
                      {
                        id: uid(),
                        book: opened.data.books[0].id,
                        type: f.type,
                        date: today(),
                        amount: amountOf(
                          f.amount,
                          opened.data.books[0].currency,
                        ),
                        category: "Other",
                        note: f.note,
                        person: session.username,
                        due: "",
                      },
                    ],
                  };
                  const result = await api(`/shared/${opened.id}`, "PUT", {
                    revision: opened.revision,
                    vault: await seal(data, opened.key, opened.vault.salt),
                  });
                  setOpened({ ...opened, data, revision: result.revision });
                  e.target.reset();
                });
              }}
            >
              <select name="type" aria-label="Shared transaction type">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input
                name="amount"
                aria-label="Shared amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
              <input
                name="note"
                aria-label="Shared description"
                placeholder="Description"
                maxLength={200}
                required
              />
              <button>Add shared entry</button>
            </form>
          )}
          <h3>Members</h3>
          {opened.members.map((m) => (
            <p key={m.username}>
              {m.username} · {m.role}
            </p>
          ))}
          {opened.role === "owner" && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.target));
                act(async () => {
                  await api(`/shared/${opened.id}/members`, "PUT", f);
                  const r = await api(`/shared/${opened.id}`);
                  setOpened({ ...opened, members: r.members });
                });
              }}
            >
              <input
                name="username"
                placeholder="Existing username"
                aria-label="Member username"
                required
                pattern="[a-z0-9_]{3,24}"
              />
              <select name="role" aria-label="Member permission">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="remove">Remove access</option>
              </select>
              <button>Update member</button>
            </form>
          )}
          <small>
            Removing a member blocks future server access. It cannot revoke
            copies already downloaded. Shared-book names and membership are
            visible to the server; financial contents are encrypted.
          </small>
        </div>
      )}
    </section>
  );
}
