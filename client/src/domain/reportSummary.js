import { categories } from "./constants.js";
export function getReportSummary({
  data,
  unit,
  book,
  type,
  from,
  to,
  search
}) {
  const currencyBooks = data.books.filter(b => b.currency === unit);
  const selected = data.transactions.filter(t => {
    const b = data.books.find(b => b.id === t.book);
    return b?.currency === unit && (book === "all" || t.book === book) && (type === "all" || type === t.type) && (!from || t.date >= from) && (!to || t.date <= to) && `${t.note} ${t.category} ${b.name} ${t.person || ""}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => b.date.localeCompare(a.date));
  const income = selected.filter(t => t.type === "income" && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const expense = selected.filter(t => t.type === "expense" && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const balance = data.transactions.filter(t => currencyBooks.some(b => b.id === t.book)).reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  const categoryTotals = [...new Set([...categories, ...selected.map(t => t.category)])].map(c => ({
    name: c,
    total: selected.filter(t => t.category === c && t.type === "expense" && !t.transfer).reduce((s, t) => s + t.amount, 0)
  })).filter(c => c.total).sort((a, b) => b.total - a.total);
  const months = Array.from({
    length: 6
  }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const ts = selected.filter(t => t.date.startsWith(prefix));
    return {
      label: d.toLocaleDateString(undefined, {
        month: "short"
      }),
      income: ts.filter(t => t.type === "income" && !t.transfer).reduce((s, t) => s + t.amount, 0),
      expense: ts.filter(t => t.type === "expense" && !t.transfer).reduce((s, t) => s + t.amount, 0)
    };
  });
  const maxChart = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
  return {
    currencyBooks,
    selected,
    income,
    expense,
    balance,
    categoryTotals,
    months,
    maxChart
  };
}
