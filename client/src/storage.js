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
    false,
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
  if (!res.ok) throw new Error(data.error || "Request failed");
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
