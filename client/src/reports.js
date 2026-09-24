import { jsPDF } from "jspdf";
import { digits } from "./storage.js";
export function buildPDF(data, rows, currency, from, to) {
  const doc = new jsPDF();
  let y = 22;
  const line = (text, size = 10) => {
    const normalized = String(text).replaceAll("→", "->").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    if ([...normalized].some(char => char.codePointAt(0) > 255)) throw new Error("For this report's language, use Print → Save as PDF to preserve the text.");
    const lines = doc.splitTextToSize(normalized, 175);
    for (const value of lines) {
      if (y > 276) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(size);
      doc.text(value, 17, y);
      y += size * 0.48 + 2;
    }
  };
  line("CashManage | Financial statement", 18);
  line(`${data.profile.name} | ${currency} | ${from || "Beginning"} to ${to || "Today"}`);
  y += 5;
  const income = rows.filter(t => t.type === "income" && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const expense = rows.filter(t => t.type === "expense" && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const format = n => `${currency} ${(n / 10 ** digits(currency)).toFixed(digits(currency))}`;
  line(`Income: ${format(income)}    Expenses: ${format(expense)}`);
  line(`Net cash flow: ${format(income - expense)} (wallet transfers excluded)`);
  y += 5;
  rows.forEach(t => {
    line(`${t.date} | ${data.books.find(b => b.id === t.book)?.name} | ${t.transfer ? "Transfer" : t.type} | ${format(t.amount)}`);
    line(`${t.category}: ${t.note}${t.person ? " | " + t.person : ""}`, 9);
    y += 3;
  });
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Generated ${new Date().toLocaleDateString()} | Page ${i} of ${count}`, 17, 289);
  }
  return doc;
}
export function exportPDF(data, rows, currency, from, to) {
  buildPDF(data, rows, currency, from, to).save(`cashmanage-${from || "all"}-${to || "time"}.pdf`);
}
