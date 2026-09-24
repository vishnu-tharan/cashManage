import test from "node:test";
import assert from "node:assert/strict";
import { buildPDF } from "./src/reports.js";
import { initial } from "./src/storage.js";
test("PDF reports paginate long statements and keep transfers out of income totals", () => {
  const d = initial("Report test");
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    date: "2026-09-12",
    book: d.books[0].id,
    type: "income",
    amount: 100,
    note: "Entry " + i,
    category: "Other",
  }));
  rows.push({
    ...rows[0],
    amount: 999999,
    transfer: "pair",
    note: "Wallet → wallet",
  });
  const pdf = buildPDF(d, rows, "LKR", "2026-09-01", "2026-09-30");
  assert.ok(pdf.getNumberOfPages() > 1);
  const output = pdf.output();
  assert.ok(output.startsWith("%PDF"));
  assert.ok(output.includes("Income: LKR 100.00"));
  assert.ok(output.includes("Page 1 of"));
});
test("PDF unsupported scripts get an explicit browser print fallback", () => {
  const d = initial("தமிழ்");
  assert.throws(() => buildPDF(d, [], "LKR", "", ""), /Print/);
});
