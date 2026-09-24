import { ask } from "../dialogs";
import { money, today } from "../storage";
import { transfer, uid, amountOf, postRecurring, createDebt, debtRemaining, repay, budgetAlerts, isCashFlow } from "../ledger";
import { Field } from "../components/forms";
export default function PlanningPage({
  data,
  save,
  act
}) {
  const books = <>
      {data.books.map(b => <option key={b.id} value={b.id}>
          {b.name} ({b.currency})
        </option>)}
    </>;
  const submit = fn => e => {
    e.preventDefault();
    const form = e.target;
    const f = Object.fromEntries(new FormData(form));
    act(async () => {
      await fn(f);
      form.reset();
    });
  };
  const alerts = budgetAlerts(data, today().slice(0, 7));
  return <>
      <section className="card alerts">
        <h3>Budget alerts</h3>
        {alerts.length ? alerts.map(b => <p className={b.percent >= 100 ? "expense" : ""} key={b.id}>
              {b.name}: {b.percent}% used · {money(b.spent, b.currency)} /{" "}
              {money(b.budget, b.currency)}
            </p>) : <p>No budgets have reached 80% this month.</p>}
        <small>Alerts appear in-app while your workspace is open.</small>
      </section>
      <div className="settings-grid">
        <section className="card">
          <h3>Transfer between wallets</h3>
          <p>
            Transfers change wallet balances, without inflating income or
            expense totals. For different currencies, enter the actual amount
            received.
          </p>
          <form onSubmit={submit(f => save(transfer(data, f), "Wallet transfer"))}>
            <Field label="From wallet">
              <select name="source">{books}</select>
            </Field>
            <Field label="To wallet">
              <select name="destination" defaultValue={data.books[1]?.id}>
                {books}
              </select>
            </Field>
            <Field label="Amount sent">
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </Field>
            <Field label="Amount received (different currency only)">
              <input name="received" type="number" min="0.01" step="0.01" />
            </Field>
            <Field label="Transfer date">
              <input name="date" type="date" required defaultValue={today()} />
            </Field>
            <input name="note" aria-label="Transfer note" placeholder="Optional note" maxLength={200} />
            <button className="primary">Record transfer</button>
          </form>
        </section>
        <section className="card">
          <h3>Recurring transactions</h3>
          <p>
            Due entries post when you open this workspace. Nothing runs while
            the app is closed.
          </p>
          <form onSubmit={submit(f => {
          const b = data.books.find(b => b.id === f.book);
          return save({
            ...data,
            recurring: [...(data.recurring || []), {
              ...f,
              id: uid(),
              amount: amountOf(f.amount, b.currency),
              anchor: Number(f.next.slice(-2)),
              active: true,
              category: "Other"
            }]
          }, "Created recurring schedule");
        })}>
            <Field label="Schedule name">
              <input name="name" placeholder="Salary, rent, subscription…" required maxLength={100} />
            </Field>
            <Field label="Schedule wallet">
              <select name="book">{books}</select>
            </Field>
            <div className="form-row">
              <Field label="Direction">
                <select name="type">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </Field>
              <Field label="Frequency">
                <select name="frequency">
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </Field>
            </div>
            <Field label="Recurring amount">
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </Field>
            <Field label="First date">
              <input name="next" type="date" required defaultValue={today()} />
            </Field>
            <button>Create schedule</button>
          </form>
          {(data.recurring || []).map(r => <div className="rate" key={r.id}>
              <span>
                {r.name} · next {r.next}
              </span>
              <button onClick={() => act(() => save({
            ...data,
            recurring: data.recurring.map(x => x.id === r.id ? {
              ...x,
              active: !x.active
            } : x)
          }, "Changed schedule"))}>
                {r.active ? "Pause" : "Resume"}
              </button>
            </div>)}
          <button onClick={() => act(async () => {
          const result = postRecurring(data, today());
          if (result.count) await save(result.data, `Posted ${result.count} recurring entries`);
        })}>
            Post due entries now
          </button>
        </section>
        <section className="card">
          <h3>Debts & partial repayments</h3>
          <form onSubmit={submit(f => save(createDebt(data, f), "Recorded debt"))}>
            <Field label="Debt description">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Person">
              <input name="person" required maxLength={80} />
            </Field>
            <Field label="Debt direction">
              <select name="direction">
                <option value="borrowed">I borrowed / I owe</option>
                <option value="lent">I lent / owed to me</option>
              </select>
            </Field>
            <Field label="Debt wallet">
              <select name="book">{books}</select>
            </Field>
            <Field label="Original amount">
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </Field>
            <div className="form-row">
              <Field label="Debt date">
                <input name="date" type="date" required defaultValue={today()} />
              </Field>
              <Field label="Repayment due">
                <input name="due" type="date" required />
              </Field>
            </div>
            <button>Record debt and cash movement</button>
          </form>
          {(data.debts || []).map(d => {
          const remaining = debtRemaining(data, d);
          return <div className="history-row" key={d.id}>
                <div>
                  <strong>
                    {d.person} · {d.name}
                  </strong>
                  <small className={remaining > 0 && d.due < today() ? "expense" : ""}>
                    {money(remaining, d.currency)} remaining ·{" "}
                    {remaining === 0 ? "Settled" : d.due < today() ? "Overdue" : "Due " + d.due}
                  </small>
                </div>
                <button disabled={remaining <= 0} onClick={() => act(async () => {
              const value = await ask(`Repayment amount (${d.currency}):`);
              if (value) await save(repay(data, d, value, today()), "Debt repayment");
            })}>
                  Repay
                </button>
              </div>;
        })}
        </section>
        <section className="card">
          <h3>Savings goals</h3>
          <p>
            Progress tracks money you earmark toward a target. Contributions do
            not create cash transactions.
          </p>
          <form onSubmit={submit(f => save({
          ...data,
          goals: [...(data.goals || []), {
            ...f,
            id: uid(),
            target: amountOf(f.target, data.books.find(b => b.id === f.book).currency),
            saved: 0
          }]
        }, "Created savings goal"))}>
            <Field label="Goal name">
              <input name="name" required maxLength={80} />
            </Field>
            <Field label="Goal wallet">
              <select name="book">{books}</select>
            </Field>
            <Field label="Target amount">
              <input name="target" type="number" required min="0.01" step="0.01" />
            </Field>
            <Field label="Target date">
              <input name="date" type="date" required defaultValue={today()} />
            </Field>
            <button>Create goal</button>
          </form>
          {(data.goals || []).map(g => {
          const c = data.books.find(b => b.id === g.book)?.currency || "LKR";
          const months = Math.max(1, Math.ceil((Date.parse(g.date) - Date.parse(today())) / (30.44 * 86400000)));
          return <div className="goal" key={g.id}>
                <h3>{g.name}</h3>
                <progress max={g.target} value={g.saved} />
                <small>
                  {money(g.saved, c)} of {money(g.target, c)} · Suggested
                  monthly:{" "}
                  {money(Math.max(0, Math.ceil((g.target - g.saved) / months)), c)}
                </small>
                <button onClick={() => act(async () => {
              const value = await ask(`Contribution (${c}):`);
              if (value) await save({
                ...data,
                goals: data.goals.map(x => x.id === g.id ? {
                  ...x,
                  saved: x.saved + amountOf(value, c)
                } : x)
              }, "Updated goal progress");
            })}>
                  Add progress
                </button>
              </div>;
        })}
        </section>
      </div>
      <section className="card trend">
        <h3>Month-to-month comparison</h3>
        {data.books.map(b => {
        const month = today().slice(0, 7);
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - 1);
        const previous = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const sum = m => data.transactions.filter(t => t.book === b.id && t.type === "expense" && isCashFlow(t) && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0);
        const sessionRef = sum(month);
        const last = sum(previous);
        return <div className="rate" key={b.id}>
              <span>{b.name}</span>
              <span>
                This month {money(sessionRef, b.currency)} · Previous{" "}
                {money(last, b.currency)} ·{" "}
                {last ? `${Math.round((sessionRef - last) / last * 100)}% change` : "No previous spending"}
              </span>
            </div>;
      })}
      </section>
    </>;
}
