const enc = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const bytes = (h) =>
  Uint8Array.from(h.match(/.{2}/g) || [], (c) => parseInt(c, 16));
export const randomSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export async function derive(password, salt) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bytes(salt), iterations: 600000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}
export async function proof(username, password) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc.encode(`cashmanage-auth:${username}`),
        iterations: 600000,
        hash: "SHA-256",
      },
      base,
      256,
    ),
  );
}
export async function seal(data, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    version: 1,
    salt,
    iv: hex(iv),
    cipher: hex(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(JSON.stringify(data)),
      ),
    ),
  };
}
export async function unseal(vault, key) {
  const data = JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes(vault.iv) },
        key,
        bytes(vault.cipher),
      ),
    ),
  );
  return validateData(data);
}
export function validateData(data) {
  const short = (v, max) => typeof v === "string" && v.length <= max;
  if (
    !data.profile ||
    !short(data.profile.name, 50) ||
    !data.profile.name.trim() ||
    !currencies.includes(data.profile.currency) ||
    ![5, 15, 30, 60].includes(data.profile.timeout) ||
    !Array.isArray(data.books) ||
    !data.books.length ||
    data.books.length > 1000 ||
    !Array.isArray(data.transactions) ||
    data.transactions.length > 50000
  )
    throw new Error("Invalid backup contents");
  const ids = new Set();
  for (const b of data.books) {
    if (
      !short(b.id, 80) ||
      !b.id ||
      ids.has(b.id) ||
      !short(b.name, 50) ||
      !b.name.trim() ||
      !short(b.kind, 50) ||
      !currencies.includes(b.currency) ||
      !Number.isSafeInteger(b.budget) ||
      b.budget < 0
    )
      throw new Error("Invalid cashbook in backup");
    ids.add(b.id);
  }
  const tids = new Set();
  const date = (v) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  for (const t of data.transactions) {
    if (
      !short(t.id, 80) ||
      !t.id ||
      tids.has(t.id) ||
      !Number.isSafeInteger(t.amount) ||
      t.amount <= 0 ||
      !["income", "expense"].includes(t.type) ||
      !ids.has(t.book) ||
      !date(t.date) ||
      !short(t.note, 200) ||
      !short(t.category, 80) ||
      (t.person != null && !short(t.person, 80)) ||
      (t.due && !date(t.due))
    )
      throw new Error("Invalid transaction in backup");
    tids.add(t.id);
  }
  for (const field of ["recurring", "goals", "debts", "history"])
    if (
      data[field] !== undefined &&
      (!Array.isArray(data[field]) ||
        data[field].length > (field === "history" ? 200 : 1000))
    )
      throw new Error("Invalid " + field);
  const positive = (n) => Number.isSafeInteger(n) && n > 0;
  for (const r of data.recurring || [])
    if (
      !short(r.id, 80) ||
      !short(r.name, 100) ||
      !ids.has(r.book) ||
      !positive(r.amount) ||
      !date(r.next) ||
      !["income", "expense"].includes(r.type) ||
      !["weekly", "monthly", "yearly"].includes(r.frequency) ||
      !Number.isInteger(r.anchor) ||
      r.anchor < 1 ||
      r.anchor > 31 ||
      typeof r.active !== "boolean"
    )
      throw new Error("Invalid recurring schedule");
  for (const g of data.goals || [])
    if (
      !short(g.id, 80) ||
      !short(g.name, 80) ||
      !ids.has(g.book) ||
      !positive(g.target) ||
      !Number.isSafeInteger(g.saved) ||
      g.saved < 0 ||
      !date(g.date)
    )
      throw new Error("Invalid savings goal");
  for (const d of data.debts || [])
    if (
      !short(d.id, 80) ||
      !short(d.name, 100) ||
      !short(d.person, 80) ||
      !ids.has(d.book) ||
      !positive(d.amount) ||
      !date(d.date) ||
      !date(d.due) ||
      !["borrowed", "lent"].includes(d.direction) ||
      d.currency !== data.books.find((b) => b.id === d.book).currency
    )
      throw new Error("Invalid debt");
  for (const field of ["recurring", "goals", "debts"])
    if (
      new Set((data[field] || []).map((x) => x.id)).size !==
      (data[field] || []).length
    )
      throw new Error("Duplicate " + field + " identifier");
  for (const debt of data.debts || []) {
    const tx = data.transactions.filter((t) => t.debt === debt.id);
    const principal = tx.filter((t) => !t.repayment);
    if (
      principal.length !== 1 ||
      principal[0].amount !== debt.amount ||
      principal[0].book !== debt.book ||
      principal[0].type !==
        (debt.direction === "borrowed" ? "income" : "expense") ||
      tx
        .filter((t) => t.repayment)
        .some(
          (t) =>
            t.book !== debt.book ||
            t.type !== (debt.direction === "borrowed" ? "expense" : "income"),
        ) ||
      tx.filter((t) => t.repayment).reduce((sum, t) => sum + t.amount, 0) >
        debt.amount
    )
      throw new Error("Debt and repayment entries must remain consistent");
  }
  const pairs = new Map();
  for (const t of data.transactions) {
    if (t.transfer) {
      if (!short(t.transfer, 80)) throw new Error("Invalid transfer");
      pairs.set(t.transfer, [...(pairs.get(t.transfer) || []), t]);
    }
    if (
      t.receipt &&
      (!short(t.receipt.name, 100) ||
        !["image/jpeg", "image/png", "application/pdf"].includes(
          t.receipt.type,
        ) ||
        typeof t.receipt.content !== "string" ||
        !t.receipt.content.startsWith(`data:${t.receipt.type};base64,`) ||
        t.receipt.content.length > 410000 ||
        !Number.isSafeInteger(t.receipt.size) ||
        t.receipt.size < 0 ||
        t.receipt.size > 300000)
    )
      throw new Error("Invalid receipt");
  }
  for (const pair of pairs.values())
    if (
      pair.length !== 2 ||
      pair[0].book === pair[1].book ||
      pair[0].type === pair[1].type ||
      pair[0].date !== pair[1].date ||
      (data.books.find((b) => b.id === pair[0].book).currency ===
        data.books.find((b) => b.id === pair[1].book).currency &&
        pair[0].amount !== pair[1].amount)
    )
      throw new Error(
        "A transfer must keep its matching debit and credit. Resolve both entries together.",
      );
  for (const h of data.history || [])
    if (
      !short(h.id, 80) ||
      !short(h.label, 200) ||
      !short(h.at, 40) ||
      !Array.isArray(h.changes)
    )
      throw new Error("Invalid history");
  return data;
}
export async function api(path, method = "GET", body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = res.status;
    throw error;
  }
  return data;
}
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function drive(action, vault) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId)
    throw new Error(
      "Set VITE_GOOGLE_CLIENT_ID and enable Google Drive API first. See README.",
    );
  if (!window.google?.accounts)
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Google sign-in could not load"));
      document.head.append(s);
    });
  const token = await new Promise((resolve, reject) =>
    window.google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.appdata",
        callback: (r) =>
          r.error ? reject(new Error(r.error)) : resolve(r.access_token),
        error_callback: () => reject(new Error("Google sign-in cancelled")),
      })
      .requestAccessToken(),
  );
  const request = async (url, options = {}) => {
    const r = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!r.ok) throw new Error(`Google Drive request failed (${r.status})`);
    return r.json();
  };
  const root = "https://www.googleapis.com/drive/v3/files";
  if (action === "restore") {
    const result = await request(
      `${root}?spaces=appDataFolder&orderBy=createdTime%20desc&pageSize=1&q=trashed%3Dfalse&fields=files(id,name)`,
    );
    if (!result.files.length) throw new Error("No Drive backup found");
    return request(`${root}/${result.files[0].id}?alt=media`);
  }
  const form = new FormData();
  form.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          name: `cashmanage-${new Date().toISOString()}.json`,
          parents: ["appDataFolder"],
        }),
      ],
      { type: "application/json" },
    ),
  );
  form.append(
    "file",
    new Blob([JSON.stringify(vault)], { type: "application/json" }),
  );
  return request(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    { method: "POST", body: form },
  );
}
export const currencies = [
  "LKR",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AUD",
  "CAD",
  "JPY",
  "AED",
  "SGD",
  "CHF",
  "CNY",
  "NZD",
  "SAR",
];
export const digits = (currency) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;
export const money = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    amount / 10 ** digits(currency),
  );
export const today = () => new Date().toLocaleDateString("en-CA");
export function initial(name = "Guest") {
  return {
    profile: { name, currency: "LKR", timeout: 15 },
    books: [
      {
        id: crypto.randomUUID(),
        name: "Personal wallet",
        kind: "Personal",
        currency: "LKR",
        budget: 0,
      },
      {
        id: crypto.randomUUID(),
        name: "Shopping wallet",
        kind: "Shopping",
        currency: "LKR",
        budget: 0,
      },
    ],
    transactions: [],
  };
}
