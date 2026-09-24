import { digits } from "./storage.js";
export const uid = () => crypto.randomUUID();
export const isCashFlow = t => !t.transfer;
export const amountOf = (value, currency) => {
  const amount = Number(value) * 10 ** digits(currency);
  if (!Number.isFinite(amount) || Math.abs(amount - Math.round(amount)) > 0.00001 || !Number.isSafeInteger(Math.round(amount)) || amount <= 0) throw new Error("Enter a positive amount with the correct currency precision");
  return Math.round(amount);
};
export function upgrade(data) {
  return {
    ...data,
    recurring: data.recurring || [],
    goals: data.goals || [],
    debts: data.debts || [],
    history: data.history || []
  };
}
export function record(before, next, label = "Workspace updated") {
  const previous = new Map(before.transactions.map(t => [t.id, t]));
  const after = new Map(next.transactions.map(t => [t.id, t]));
  const changes = [];
  for (const id of new Set([...previous.keys(), ...after.keys()])) if (JSON.stringify(previous.get(id)) !== JSON.stringify(after.get(id))) changes.push({
    id,
    before: previous.get(id) || null,
    after: after.get(id) || null
  });
  const result = {
    ...upgrade(next),
    history: [{
      id: uid(),
      at: new Date().toISOString(),
      label,
      changes
    }, ...(next.history || before.history || [])].slice(0, 200)
  };
  while (result.history.length && JSON.stringify(result).length > 1800000) result.history.pop();
  return result;
}
export function undo(data, event) {
  if (!event.changes.length) throw new Error("This event has no transaction changes to undo");
  let ts = [...data.transactions];
  for (const c of event.changes) {
    const sessionRef = ts.find(t => t.id === c.id) || null;
    if (JSON.stringify(sessionRef) !== JSON.stringify(c.after)) throw new Error("A transaction changed later. Review its current value before undoing.");
    ts = ts.filter(t => t.id !== c.id);
    if (c.before) ts.push(c.before);
  }
  let debts = data.debts || [];
  for (const change of event.changes) if (!change.before && change.after?.debt && !change.after.repayment) {
    const id = change.after.debt;
    if (ts.some(t => t.debt === id)) throw new Error("Undo the repayments before undoing this debt");
    debts = debts.filter(d => d.id !== id);
  }
  return {
    ...data,
    debts,
    transactions: ts
  };
}
export function transfer(data, input) {
  const source = data.books.find(b => b.id === input.source);
  const destination = data.books.find(b => b.id === input.destination);
  if (!source || !destination || source.id === destination.id) throw new Error("Choose two different cashbooks");
  const amount = amountOf(input.amount, source.currency);
  const received = source.currency === destination.currency ? amount : amountOf(input.received, destination.currency);
  const id = uid();
  const base = {
    date: input.date,
    category: "Transfer",
    note: input.note || `${source.name} → ${destination.name}`,
    transfer: id,
    person: "",
    due: ""
  };
  return {
    ...data,
    transactions: [...data.transactions, {
      ...base,
      id: uid(),
      book: source.id,
      type: "expense",
      amount
    }, {
      ...base,
      id: uid(),
      book: destination.id,
      type: "income",
      amount: received
    }]
  };
}
export function nextDate(date, frequency, anchor) {
  const d = new Date(`${date}T12:00:00Z`);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);else {
    const day = anchor || d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + (frequency === "yearly" ? 12 : 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}
export function postRecurring(data, date) {
  let ts = [...data.transactions];
  let count = 0;
  const recurring = (data.recurring || []).map(rule => {
    let next = rule.next;
    if (!rule.active) return rule;
    let steps = 0;
    while (next <= date && steps++ < 366) {
      const id = `rec:${rule.id}:${next}`;
      if (!ts.some(t => t.id === id)) {
        ts.push({
          id,
          book: rule.book,
          type: rule.type,
          amount: rule.amount,
          date: next,
          category: rule.category,
          note: rule.name,
          person: "",
          due: "",
          recurring: rule.id
        });
        count++;
      }
      next = nextDate(next, rule.frequency, rule.anchor);
    }
    return {
      ...rule,
      next
    };
  });
  return {
    data: {
      ...data,
      transactions: ts,
      recurring
    },
    count
  };
}
export function debtRemaining(data, debt) {
  return debt.amount - data.transactions.filter(t => t.debt === debt.id && t.repayment).reduce((s, t) => s + t.amount, 0);
}
export function createDebt(data, f) {
  const book = data.books.find(b => b.id === f.book);
  const amount = amountOf(f.amount, book.currency);
  const id = uid();
  return {
    ...data,
    debts: [...(data.debts || []), {
      ...f,
      id,
      amount,
      currency: book.currency
    }],
    transactions: [...data.transactions, {
      id: uid(),
      book: book.id,
      type: f.direction === "borrowed" ? "income" : "expense",
      amount,
      date: f.date,
      category: "Debt",
      note: f.name,
      person: f.person,
      due: f.due,
      debt: id
    }]
  };
}
export function repay(data, debt, value, date) {
  const amount = amountOf(value, debt.currency);
  if (amount > debtRemaining(data, debt)) throw new Error("Repayment exceeds the remaining debt");
  return {
    ...data,
    transactions: [...data.transactions, {
      id: uid(),
      book: debt.book,
      type: debt.direction === "borrowed" ? "expense" : "income",
      amount,
      date,
      category: "Debt",
      note: `Repayment: ${debt.name}`,
      person: debt.person,
      due: "",
      debt: debt.id,
      repayment: true
    }]
  };
}
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quotation");
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  const headers = rows.shift()?.map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase()) || [];
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
}
export function prepareImport(data, rows, bookId, mapping = {}) {
  const book = data.books.find(b => b.id === bookId);
  if (!book) throw new Error("Choose a destination cashbook");
  const fingerprint = t => JSON.stringify([t.book, t.date, t.type, t.amount, t.note.trim().toLowerCase()]);
  const known = new Set(data.transactions.map(fingerprint));
  const accepted = [];
  const errors = [];
  let duplicates = 0;
  rows.forEach((r, index) => {
    try {
      const read = k => r[mapping[k] || k];
      const rawAmount = String(read("amount") ?? "").replace(/,/g, "").trim();
      const n = Number(rawAmount);
      if (!rawAmount || !Number.isFinite(n)) throw new Error("Invalid amount");
      const rawType = String(read("type") || "").toLowerCase();
      if (rawType.startsWith("transfer")) throw new Error("Recreate wallet transfers through Planning to preserve both sides");
      if (rawType && !["income", "credit", "in", "expense", "outcome", "debit", "out"].includes(rawType)) throw new Error("Unknown direction; map credit/debit values to income/expense");
      const type = ["income", "credit", "in"].includes(rawType) ? "income" : ["expense", "outcome", "debit", "out"].includes(rawType) ? "expense" : n < 0 ? "expense" : "income";
      const date = String(read("date") || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Date must be YYYY-MM-DD");
      if (read("currency") && read("currency") !== book.currency) throw new Error("Currency differs from destination wallet");
      const t = {
        id: uid(),
        book: bookId,
        date,
        type,
        amount: amountOf(Math.abs(n), book.currency),
        note: String(read("note") || r.remark || "Imported entry").slice(0, 200),
        category: String(read("category") || "Other").slice(0, 80),
        person: "",
        due: ""
      };
      const key = fingerprint(t);
      if (known.has(key)) {
        duplicates++;
        return;
      }
      known.add(key);
      accepted.push(t);
    } catch (e) {
      errors.push(`Row ${index + 2}: ${e.message}`);
    }
  });
  return {
    accepted,
    duplicates,
    errors
  };
}
export function budgetAlerts(data, month) {
  return data.books.filter(b => b.budget > 0).map(b => {
    const spent = data.transactions.filter(t => t.book === b.id && t.type === "expense" && isCashFlow(t) && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);
    return {
      ...b,
      spent,
      percent: Math.round(spent / b.budget * 100)
    };
  }).filter(b => b.percent >= 80);
}
export function mergeVersions(local, remote, choices = {}) {
  const result = {
    ...remote,
    profile: choices.profile === "local" ? local.profile : remote.profile
  };
  for (const field of ["books", "transactions", "recurring", "goals", "debts", "history"]) {
    const map = new Map((remote[field] || []).map(x => [x.id, x]));
    for (const item of local[field] || []) {
      const choice = choices[`${field}:${item.id}`];
      if (!map.has(item.id) || choice === "local") map.set(item.id, item);
      if (choice === "delete") map.delete(item.id);
    }
    for (const id of map.keys()) if (choices[`${field}:${id}`] === "delete") map.delete(id);
    result[field] = [...map.values()];
  }
  return upgrade(result);
}
