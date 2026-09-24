import test from "node:test";
import assert from "node:assert/strict";
import { initial, validateData } from "./src/storage.js";
import {
  transfer,
  amountOf,
  nextDate,
  postRecurring,
  record,
  undo,
  createDebt,
  repay,
  debtRemaining,
  prepareImport,
  parseCSV,
  mergeVersions,
  budgetAlerts,
} from "./src/ledger.js";
test("Transfers preserve total cash and reject broken pairs", () => {
  const d = initial();
  const n = transfer(d, {
    source: d.books[0].id,
    destination: d.books[1].id,
    amount: "150.25",
    date: "2026-09-12",
  });
  assert.equal(n.transactions.length, 2);
  assert.equal(
    n.transactions.reduce(
      (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
      0,
    ),
    0,
  );
  validateData(n);
  assert.throws(() =>
    validateData({ ...n, transactions: n.transactions.slice(1) }),
  );
  assert.throws(() =>
    transfer(d, {
      source: d.books[0].id,
      destination: d.books[0].id,
      amount: "1",
    }),
  );
  assert.throws(() => amountOf("1.234", "USD"));
  assert.throws(() => amountOf("1.5", "JPY"));
});
test("Monthly recurrence clamps days without drifting, and posts once", () => {
  assert.equal(nextDate("2024-01-31", "monthly", 31), "2024-02-29");
  assert.equal(nextDate("2024-02-29", "monthly", 31), "2024-03-31");
  const d = initial();
  d.recurring = [
    {
      id: "rent",
      name: "Rent",
      book: d.books[0].id,
      type: "expense",
      amount: 10000,
      category: "Bills",
      next: "2026-01-31",
      frequency: "monthly",
      anchor: 31,
      active: true,
    },
  ];
  const r = postRecurring(d, "2026-03-31");
  assert.equal(r.count, 3);
  assert.equal(r.data.recurring[0].next, "2026-04-30");
  assert.equal(postRecurring(r.data, "2026-03-31").count, 0);
  validateData(r.data);
});
test("Partial debt repayment cannot exceed outstanding amount", () => {
  const d = initial();
  const n = createDebt(d, {
    name: "Loan",
    person: "Test",
    book: d.books[0].id,
    direction: "borrowed",
    amount: "100",
    date: "2026-09-01",
    due: "2026-10-01",
  });
  const debt = n.debts[0],
    r = repay(n, debt, "30", "2026-09-12");
  assert.equal(debtRemaining(r, debt), 7000);
  assert.throws(() => repay(r, debt, "71", "2026-09-12"));
  validateData(r);
});
test("Undo restores a deleted entry and refuses stale edits", () => {
  const d = initial();
  d.transactions = [
    {
      id: "t",
      book: d.books[0].id,
      type: "income",
      amount: 100,
      date: "2026-09-12",
      note: "Test",
      category: "Other",
    },
  ];
  const n = record(d, { ...d, transactions: [] }, "Delete");
  assert.deepEqual(undo(n, n.history[0]).transactions, d.transactions);
  assert.throws(() =>
    undo(
      { ...n, transactions: [{ ...d.transactions[0], amount: 200 }] },
      n.history[0],
    ),
  );
});
test("CSV quoting, duplicate detection, invalid dates and currencies", () => {
  const rows = parseCSV(
    'date,amount,type,note,currency\r\n2026-09-12,10,expense,"Lunch, coffee",LKR\r\n2026-09-12,10,expense,"Lunch, coffee",LKR\r\n2026-02-31,1,expense,x,LKR\r\n2026-09-12,1,expense,x,USD',
  );
  const d = initial(),
    r = prepareImport(d, rows, d.books[0].id);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].note, "Lunch, coffee");
  assert.equal(r.duplicates, 1);
  assert.equal(r.errors.length, 2);
  assert.equal(
    prepareImport({ ...d, transactions: r.accepted }, rows, d.books[0].id)
      .accepted.length,
    0,
  );
});
test("Explicit merge choices handle remote-only deletions", () => {
  const d = initial();
  const remote = { ...d, transactions: [{ id: "remote" }] },
    local = { ...d, transactions: [{ id: "local" }] };
  const m = mergeVersions(local, remote, { "transactions:remote": "delete" });
  assert.deepEqual(m.transactions, [{ id: "local" }]);
});
test("Budget alerts exclude outgoing transfers", () => {
  const d = initial();
  d.books[0].budget = 10000;
  const n = transfer(d, {
    source: d.books[0].id,
    destination: d.books[1].id,
    amount: "100",
    date: "2026-09-12",
  });
  assert.equal(budgetAlerts(n, "2026-09").length, 0);
  n.transactions.push({
    book: d.books[0].id,
    type: "expense",
    amount: 8500,
    date: "2026-09-12",
  });
  assert.equal(budgetAlerts(n, "2026-09")[0].percent, 85);
});
