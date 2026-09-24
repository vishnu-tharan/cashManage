import { currencies } from "./currency.js";
export function validateData(data) {
  const short = (v, max) => typeof v === "string" && v.length <= max;
  if (!data.profile || !short(data.profile.name, 50) || !data.profile.name.trim() || !currencies.includes(data.profile.currency) || ![5, 15, 30, 60].includes(data.profile.timeout) || !Array.isArray(data.books) || !data.books.length || data.books.length > 1000 || !Array.isArray(data.transactions) || data.transactions.length > 50000) throw new Error("Invalid backup contents");
  const ids = new Set();
  for (const b of data.books) {
    if (!short(b.id, 80) || !b.id || ids.has(b.id) || !short(b.name, 50) || !b.name.trim() || !short(b.kind, 50) || !currencies.includes(b.currency) || !Number.isSafeInteger(b.budget) || b.budget < 0) throw new Error("Invalid cashbook in backup");
    ids.add(b.id);
  }
  const tids = new Set();
  const date = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  for (const t of data.transactions) {
    if (!short(t.id, 80) || !t.id || tids.has(t.id) || !Number.isSafeInteger(t.amount) || t.amount <= 0 || !["income", "expense"].includes(t.type) || !ids.has(t.book) || !date(t.date) || !short(t.note, 200) || !short(t.category, 80) || t.person != null && !short(t.person, 80) || t.due && !date(t.due)) throw new Error("Invalid transaction in backup");
    tids.add(t.id);
  }
  for (const field of ["recurring", "goals", "debts", "history"]) if (data[field] !== undefined && (!Array.isArray(data[field]) || data[field].length > (field === "history" ? 200 : 1000))) throw new Error("Invalid " + field);
  const positive = n => Number.isSafeInteger(n) && n > 0;
  for (const r of data.recurring || []) if (!short(r.id, 80) || !short(r.name, 100) || !ids.has(r.book) || !positive(r.amount) || !date(r.next) || !["income", "expense"].includes(r.type) || !["weekly", "monthly", "yearly"].includes(r.frequency) || !Number.isInteger(r.anchor) || r.anchor < 1 || r.anchor > 31 || typeof r.active !== "boolean") throw new Error("Invalid recurring schedule");
  for (const g of data.goals || []) if (!short(g.id, 80) || !short(g.name, 80) || !ids.has(g.book) || !positive(g.target) || !Number.isSafeInteger(g.saved) || g.saved < 0 || !date(g.date)) throw new Error("Invalid savings goal");
  for (const d of data.debts || []) if (!short(d.id, 80) || !short(d.name, 100) || !short(d.person, 80) || !ids.has(d.book) || !positive(d.amount) || !date(d.date) || !date(d.due) || !["borrowed", "lent"].includes(d.direction) || d.currency !== data.books.find(b => b.id === d.book).currency) throw new Error("Invalid debt");
  for (const field of ["recurring", "goals", "debts"]) if (new Set((data[field] || []).map(x => x.id)).size !== (data[field] || []).length) throw new Error("Duplicate " + field + " identifier");
  for (const debt of data.debts || []) {
    const tx = data.transactions.filter(t => t.debt === debt.id);
    const principal = tx.filter(t => !t.repayment);
    if (principal.length !== 1 || principal[0].amount !== debt.amount || principal[0].book !== debt.book || principal[0].type !== (debt.direction === "borrowed" ? "income" : "expense") || tx.filter(t => t.repayment).some(t => t.book !== debt.book || t.type !== (debt.direction === "borrowed" ? "expense" : "income")) || tx.filter(t => t.repayment).reduce((sum, t) => sum + t.amount, 0) > debt.amount) throw new Error("Debt and repayment entries must remain consistent");
  }
  const pairs = new Map();
  for (const t of data.transactions) {
    if (t.transfer) {
      if (!short(t.transfer, 80)) throw new Error("Invalid transfer");
      pairs.set(t.transfer, [...(pairs.get(t.transfer) || []), t]);
    }
    if (t.receipt && (!short(t.receipt.name, 100) || !["image/jpeg", "image/png", "application/pdf"].includes(t.receipt.type) || typeof t.receipt.content !== "string" || !t.receipt.content.startsWith(`data:${t.receipt.type};base64,`) || t.receipt.content.length > 410000 || !Number.isSafeInteger(t.receipt.size) || t.receipt.size < 0 || t.receipt.size > 300000)) throw new Error("Invalid receipt");
  }
  for (const pair of pairs.values()) if (pair.length !== 2 || pair[0].book === pair[1].book || pair[0].type === pair[1].type || pair[0].date !== pair[1].date || data.books.find(b => b.id === pair[0].book).currency === data.books.find(b => b.id === pair[1].book).currency && pair[0].amount !== pair[1].amount) throw new Error("A transfer must keep its matching debit and credit. Resolve both entries together.");
  for (const h of data.history || []) if (!short(h.id, 80) || !short(h.label, 200) || !short(h.at, 40) || !Array.isArray(h.changes)) throw new Error("Invalid history");
  return data;
}
