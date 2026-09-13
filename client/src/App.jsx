import { getDialog } from "./dialogs";
import { ask, confirmAction } from "./dialogs";
import { validateData } from "./storage";
import Features from "./Features";
import SharedBooks from "./SharedBooks";
import AccountSecurity from "./AccountSecurity";
import { recoverAccount } from "./recovery";
import {
  upgrade,
  record,
  postRecurring,
  mergeVersions,
  budgetAlerts,
} from "./ledger";
import { exportPDF } from "./reports";
import { useEffect, useRef, useState } from "react";
import {
  Wallet,
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Plus,
  Sun,
  Moon,
  ShieldCheck,
  LogOut,
  Download,
  Cloud,
  BookOpen,
  ChartNoAxesCombined,
  Settings,
  Trash2,
  Pencil,
  RefreshCw,
  X,
  Menu,
} from "lucide-react";
import {
  api,
  derive,
  proof,
  seal,
  unseal,
  randomSalt,
  initial,
  money,
  digits,
  currencies,
  today,
  download,
  drive,
} from "./storage";
const categories = [
  "Salary",
  "Food & dining",
  "Shopping",
  "Transport",
  "Bills & utilities",
  "Health",
  "Education",
  "Entertainment",
  "Gift",
  "Debt",
  "Other",
];
const kinds = [
  "Personal",
  "Shopping",
  "Savings",
  "Borrowed / I owe",
  "Lent / owed to me",
];
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Currency({ value, onChange }) {
  return (
    <select aria-label="Currency" value={value} onChange={onChange}>
      {currencies.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}
export default function App() {
  const [session, setSession] = useState(null),
    [data, setData] = useState(null),
    [page, setPage] = useState("Overview"),
    [theme, setTheme] = useState(
      () => localStorage.getItem("cm-theme") || "light",
    );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [modal, setModal] = useState(null),
    [search, setSearch] = useState(""),
    [book, setBook] = useState("all"),
    [type, setType] = useState("all"),
    [period, setPeriod] = useState("month"),
    [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [unit, setUnit] = useState("LKR"),
    [status, setStatus] = useState("Local only"),
    [sessions, setSessions] = useState([]),
    [rates, setRates] = useState(null),
    [menu, setMenu] = useState(false);
  const [conflict, setConflict] = useState(null);
  const operationRunning = useRef(false);
  const syncRunning = useRef(false),
    latest = useRef(null);
  const [authMode, setAuthMode] = useState("login");
  const current = useRef(null);
  const install = useRef(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const key = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            '[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] select',
          ),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const changed = (e) => {
      if (
        current.current?.username &&
        e.key === `cm:${current.current.username}`
      ) {
        current.current = null;
        setSession(null);
        setData(null);
        setModal(null);
        setMessage(
          "Another tab updated this vault. Unlock again to use the latest local copy.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cm-theme", theme);
  }, [theme]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    const prompt = (e) => {
      e.preventDefault();
      install.current = e;
    };
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    window.addEventListener("beforeinstallprompt", prompt);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  const lock = () => {
    current.current = null;
    setSession(null);
    setData(null);
    setModal(null);
    setSessions([]);
    setConflict(null);
    setMessage("Vault locked.");
  };
  useEffect(() => {
    if (!session) return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        current.current = null;
        setSession(null);
        setData(null);
        setModal(null);
        setMessage("Session locked after inactivity.");
      }, data.profile.timeout * 60000);
    };
    reset();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, data?.profile.timeout]);
  const act = async (fn) => {
    if (operationRunning.current) return;
    operationRunning.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e.message || "Something went wrong");
    } finally {
      operationRunning.current = false;
      setBusy(false);
    }
  };
  async function authenticate(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const username = String(form.get("username")).toLowerCase().trim(),
      password = String(form.get("password"));
    await act(async () => {
      let saved = JSON.parse(localStorage.getItem(`cm:${username}`) || "null");
      let vault,
        revision = 0;
      if (authMode === "register") {
        const salt = randomSalt(),
          key = await derive(password, salt);
        vault = await seal(initial(username), key, salt);
        const result = await api("/auth/register", "POST", {
          username,
          proof: await proof(username, password),
          vault,
        });
        revision = result.revision;
        saved = { vault, revision, dirty: false };
      } else if (authMode === "offline") {
        if (!saved)
          throw new Error(
            "No saved vault on this device. Sign in online first.",
          );
      } else {
        const result = await api("/auth/login", "POST", {
          username,
          proof: await proof(username, password),
          otp: String(form.get("otp") || ""),
        });
        if (!saved?.dirty) saved = { ...result, dirty: false };
      }
      const key = await derive(password, saved.vault.salt);
      let opened;
      try {
        opened = await unseal(saved.vault, key);
      } catch {
        throw new Error("Unable to unlock vault. Check your password.");
      }
      localStorage.setItem(`cm:${username}`, JSON.stringify(saved));
      const s = { username, key, salt: saved.vault.salt, guest: false };
      current.current = s;
      setSession(s);
      setData(upgrade(opened));
      setUnit(opened.profile.currency);
      setStatus(
        saved.dirty
          ? "Changes pending sync"
          : authMode === "offline"
            ? "Unlocked offline"
            : "Synced",
      );
    });
  }
  async function save(next, label = "Updated workspace", revision) {
    next = validateData(record(data, next, label));
    const s = current.current;
    if (!s) throw new Error("Please unlock your vault");
    if (!s.guest) {
      const old = JSON.parse(localStorage.getItem(`cm:${s.username}`));
      const vault = await seal(next, s.key, s.salt);
      if (JSON.stringify(vault).length > 4500000)
        throw new Error(
          "Vault is too large. Remove old receipts or export and clear activity history.",
        );
      if (current.current !== s) return;
      localStorage.setItem(
        `cm:${s.username}`,
        JSON.stringify({
          ...old,
          vault,
          revision: revision ?? old.revision,
          dirty: true,
        }),
      );
    }
    if (current.current !== s) return;
    setData(next);
    setStatus(s.guest ? "Guest · temporary" : "Saved on device · sync pending");
  }
  async function sync() {
    if (syncRunning.current || conflict) return;
    syncRunning.current = true;
    try {
      const s = current.current;
      if (s.guest)
        throw new Error(
          "Guest data stays in memory. Export a backup before leaving.",
        );
      const saved = JSON.parse(localStorage.getItem(`cm:${s.username}`));
      if (saved.dirty) {
        const result = await api("/vault", "PUT", {
          vault: saved.vault,
          revision: saved.revision,
        });
        if (current.current !== s) return;
        const newest = JSON.parse(localStorage.getItem(`cm:${s.username}`));
        const changed = newest.vault.cipher !== saved.vault.cipher;
        localStorage.setItem(
          `cm:${s.username}`,
          JSON.stringify({ ...newest, ...result, dirty: changed }),
        );
      } else {
        const result = await api("/vault");
        const opened = await unseal(result.vault, s.key);
        if (current.current !== s) return;
        if (JSON.parse(localStorage.getItem(`cm:${s.username}`)).dirty) return;
        localStorage.setItem(
          `cm:${s.username}`,
          JSON.stringify({ ...result, dirty: false }),
        );
        setData(upgrade(opened));
      }
      setStatus("Synced");
    } catch (e) {
      if (e.status === 409 && current.current) {
        const active = current.current;
        const remote = await api("/vault");
        if (current.current !== active) return;
        const remoteData = await unseal(remote.vault, active.key);
        if (current.current !== active) return;
        setConflict({ remote, remoteData, choices: {} });
        setStatus("Sync conflict needs review");
      } else throw e;
    } finally {
      syncRunning.current = false;
    }
  }
  useEffect(() => {
    latest.current = { data, session, busy, conflict, sync, save };
  });
  useEffect(() => {
    const timer = setInterval(async () => {
      const value = latest.current;
      if (
        !value?.session ||
        value.busy ||
        getDialog() ||
        operationRunning.current ||
        value.conflict ||
        syncRunning.current
      )
        return;
      operationRunning.current = true;
      try {
        const posted = postRecurring(value.data, today());
        if (posted.count) {
          operationRunning.current = true;
          await value.save(
            posted.data,
            `Posted ${posted.count} recurring entries`,
          );
          return;
        }
        if (!value.session.guest && navigator.onLine) await value.sync();
      } catch (e) {
        setStatus(
          e.status === 401
            ? "Online session expired; unlock online to reconnect"
            : "Saved locally · sync unavailable",
        );
      } finally {
        operationRunning.current = false;
      }
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  async function backup() {
    if (!session.guest)
      return JSON.parse(localStorage.getItem(`cm:${session.username}`)).vault;
    const password = await ask(
      "Choose a backup password (at least 12 characters). Keep it to restore this backup.",
    );
    if (!password || password.length < 12)
      throw new Error("Backup password must have at least 12 characters");
    const salt = randomSalt();
    return seal(data, await derive(password, salt), salt);
  }
  async function restore(vault) {
    const password = await ask("Enter the password used for this backup:");
    if (!password) return;
    let restored;
    try {
      restored = await unseal(vault, await derive(password, vault.salt));
    } catch {
      throw new Error("Invalid backup or incorrect password");
    }
    if (
      await confirmAction(
        "Replace your current cashbooks with this backup? Export your current data first if needed.",
      )
    ) {
      await save(restored);
      setMessage("Backup restored locally. Sync to update your account.");
    }
  }
  if (!session || !data)
    return (
      <div className="auth">
        <div className="auth-story">
          <div className="brand">
            <Wallet /> cashmanage<span> / personal finance</span>
          </div>
          <div>
            <div className="eyebrow">A LITTLE CLARITY. EVERY DAY.</div>
            <h1>
              Your money.
              <br />
              In a better place.
            </h1>
            <p>
              From everyday spending to the money you’re owed. Bring every
              cashbook into one calm, clear view.
            </p>
            <div className="auth-art">
              <div>
                <Wallet size={34} />
                <span>Made for your everyday</span>
                <strong>
                  Every little thing,
                  <br />
                  accounted for.
                </strong>
                <div className="pills">
                  <span>↙ Income</span>
                  <span>↗ Expenses</span>
                  <span>◎ Goals</span>
                </div>
              </div>
            </div>
          </div>
          <small>
            <ShieldCheck size={16} /> Encrypted vaults · Offline access · Your
            own backups
          </small>
        </div>
        <div className="auth-panel">
          <div className="auth-box">
            <div className="eyebrow">WELCOME TO CASHMANAGE</div>
            <h2>
              {authMode === "register"
                ? "Make room for clarity."
                : "Good to see you."}
            </h2>
            <p>
              {authMode === "offline"
                ? "Unlock the encrypted account saved on this device."
                : "A clearer picture of your money starts here."}
            </p>
            <form id="login-form" onSubmit={authenticate}>
              <Field label="Unique username">
                <input
                  name="username"
                  required
                  pattern="[A-Za-z0-9_]{3,24}"
                  minLength={3}
                  maxLength={24}
                  autoComplete="username"
                  placeholder="Your username"
                />
              </Field>
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={authMode === "register" ? 12 : 1}
                  maxLength={128}
                  autoComplete={
                    authMode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  placeholder={
                    authMode === "register"
                      ? "At least 12 characters"
                      : "Your password"
                  }
                />
              </Field>
              {authMode === "register" && (
                <small>
                  Your password encrypts your data. There is no recovery without
                  a recovery key. Generate one in Settings after signing in.
                </small>
              )}
              <button className="primary wide" disabled={busy}>
                {busy
                  ? "Unlocking…"
                  : authMode === "register"
                    ? "Create account →"
                    : "Unlock my cashbooks →"}
              </button>
            </form>
            {authMode === "login" && (
              <Field label="Authenticator code (if enabled)">
                <input
                  name="otp"
                  form="login-form"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
              </Field>
            )}
            <button
              onClick={async () =>
                act(async () => setMessage(await recoverAccount()))
              }
            >
              Recover account with recovery key
            </button>
            <div className="auth-links">
              {["login", "register", "offline"].map((m) => (
                <button
                  key={m}
                  onClick={async () => setAuthMode(m)}
                  disabled={authMode === m}
                >
                  {m === "login"
                    ? "Sign in"
                    : m === "register"
                      ? "Create account"
                      : "Offline unlock"}
                </button>
              ))}
            </div>
            <div className="divider">or explore first</div>
            <button
              className="wide"
              onClick={async () => {
                const s = { guest: true };
                current.current = s;
                setSession(s);
                setData(upgrade(initial()));
                setStatus("Guest · temporary");
              }}
            >
              Continue as guest
            </button>
            <small>
              Guest data is temporary. Export a backup before closing or
              locking.
            </small>
            {message && (
              <div role="alert" className="notice">
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  const currencyBooks = data.books.filter((b) => b.currency === unit);
  const selected = data.transactions
    .filter((t) => {
      const b = data.books.find((b) => b.id === t.book);
      return (
        b?.currency === unit &&
        (book === "all" || t.book === book) &&
        (type === "all" || type === t.type) &&
        (!from || t.date >= from) &&
        (!to || t.date <= to) &&
        `${t.note} ${t.category} ${b.name} ${t.person || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const income = selected
      .filter((t) => t.type === "income" && !t.transfer)
      .reduce((s, t) => s + t.amount, 0),
    expense = selected
      .filter((t) => t.type === "expense" && !t.transfer)
      .reduce((s, t) => s + t.amount, 0);
  const balance = data.transactions
    .filter((t) => currencyBooks.some((b) => b.id === t.book))
    .reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  const categoryTotals = [
    ...new Set([...categories, ...selected.map((t) => t.category)]),
  ]
    .map((c) => ({
      name: c,
      total: selected
        .filter((t) => t.category === c && t.type === "expense" && !t.transfer)
        .reduce((s, t) => s + t.amount, 0),
    }))
    .filter((c) => c.total)
    .sort((a, b) => b.total - a.total);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const ts = selected.filter((t) => t.date.startsWith(prefix));
    return {
      label: d.toLocaleDateString(undefined, { month: "short" }),
      income: ts
        .filter((t) => t.type === "income" && !t.transfer)
        .reduce((s, t) => s + t.amount, 0),
      expense: ts
        .filter((t) => t.type === "expense" && !t.transfer)
        .reduce((s, t) => s + t.amount, 0),
    };
  });
  const maxChart = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const nav = [
    ["Overview", LayoutDashboard],
    ["Cashbooks", BookOpen],
    ["Transactions", ArrowDownLeft],
    ["Reports", ChartNoAxesCombined],
    ["Planning", Wallet],
    ["Import & history", BookOpen],
    ["Receipts", BookOpen],
    ["Shared", BookOpen],
    ["Settings", Settings],
  ];
  function setRange(value) {
    setPeriod(value);
    const d = today();
    if (value === "month") {
      setFrom(d.slice(0, 7) + "-01");
      setTo(d);
    } else if (value === "year") {
      setFrom(d.slice(0, 4) + "-01-01");
      setTo(d);
    } else if (value === "all") {
      setFrom("");
      setTo("");
    }
  }
  const transactionTable = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Cashbook</th>
            <th>Date</th>
            <th>Amount</th>
            <th className="no-print">Actions</th>
          </tr>
        </thead>
        <tbody>
          {selected.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="transaction-name">
                  <span className={`transaction-icon ${t.type}`}>
                    {t.type === "income" ? (
                      <ArrowDownLeft size={19} />
                    ) : (
                      <ArrowUpRight size={19} />
                    )}
                  </span>
                  <div>
                    <strong>{t.note || t.category}</strong>
                    <small>
                      {t.category}
                      {t.person && ` · ${t.person}`}
                      {t.due && ` · Due ${t.due}`}
                    </small>
                  </div>
                </div>
              </td>
              <td>{data.books.find((b) => b.id === t.book)?.name}</td>
              <td>{t.date}</td>
              <td className={t.type}>
                {t.type === "income" ? "+" : "−"}
                {money(t.amount, unit)}
              </td>
              <td className="no-print">
                <button
                  disabled={!!t.transfer || !!t.debt}
                  aria-label={`Edit ${t.note || t.category}`}
                  className="icon"
                  onClick={async () =>
                    setModal({ kind: "transaction", value: t })
                  }
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Delete ${t.note || t.category}`}
                  className="icon"
                  disabled={busy || !!t.debt}
                  onClick={async () =>
                    (await confirmAction(
                      t.transfer
                        ? "Delete both sides of this wallet transfer?"
                        : "Delete this transaction? You can restore it from Import & history.",
                    )) &&
                    act(() =>
                      save({
                        ...data,
                        transactions: data.transactions.filter((x) =>
                          t.transfer
                            ? x.transfer !== t.transfer
                            : x.id !== t.id,
                        ),
                      }),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!selected.length && (
        <div className="empty">
          <div className="empty-icon">
            <ArrowDownLeft />
          </div>
          <h3>A fresh page for your money</h3>
          <p>
            No transactions match this view. Add your first entry or adjust the
            filters.
          </p>
          <button onClick={async () => setModal({ kind: "transaction" })}>
            <Plus size={16} /> Add transaction
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div className="shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-icon">
            <Wallet />
          </span>
          cashmanage<span className="brand-dot">.</span>
        </div>
        <div className="workspace">
          <span className="avatar">
            {data.profile.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{data.profile.name}</strong>
            <small>
              {session.guest ? "Guest workspace" : "Personal workspace"}
            </small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([n, Icon]) => (
            <button
              className={page === n ? "active" : ""}
              key={n}
              onClick={async () => {
                setPage(n);
                setMenu(false);
              }}
            >
              <Icon size={19} />
              {n}
              {n === "Cashbooks" && (
                <span className="nav-count">{data.books.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={22} />
            <strong>A little peace of mind</strong>
            <p>
              {session.guest
                ? "Try things out. Back up before you leave."
                : "Your cashbooks are encrypted on this device."}
            </p>
          </div>
          <button
            onClick={async () => {
              if (
                !session.guest ||
                (await confirmAction(
                  "Guest data will be cleared. Have you exported a backup?",
                ))
              ) {
                api("/logout", "POST").catch(() => {});
                lock();
              }
            }}
          >
            <LogOut size={18} />
            Lock / sign out
          </button>
          <small>YOUR MONEY. YOUR PACE.</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button
            className="icon mobile-menu"
            aria-label="Toggle navigation"
            onClick={async () => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i className={online ? "" : "offline"} />
              {online ? "Online" : "Offline"}
            </span>
            <button
              className="icon"
              aria-label="Toggle theme"
              onClick={async () =>
                setTheme(theme === "light" ? "dark" : "light")
              }
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <span className="avatar small">
              {data.profile.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR MONEY, AT A GLANCE</div>
              <h1>
                {page === "Overview" ? "Let’s make sense of your money." : page}
              </h1>
              <p>
                {page === "Overview"
                  ? "A clear view of what comes in, what goes out, and what’s next."
                  : "Small details. A clearer financial picture."}
              </p>
            </div>
            <button
              className="primary no-print"
              onClick={async () => setModal({ kind: "transaction" })}
            >
              <Plus size={18} />
              Add transaction
            </button>
          </div>
          {message && (
            <div role="status" className="notice no-print">
              {message}
              <button
                aria-label="Dismiss message"
                className="icon"
                onClick={async () => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="context-bar no-print">
            <span>
              <ShieldCheck size={15} />
              {status}
            </span>
            <div>
              <Currency
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  setBook("all");
                }}
              />
              <button
                disabled={busy || !online || session.guest}
                onClick={async () => act(sync)}
              >
                <RefreshCw size={15} />
                Sync
              </button>
            </div>
          </div>
          {["Overview", "Transactions", "Reports"].includes(page) && (
            <>
              <div className="filters no-print">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search transactions"
                    placeholder="Search notes, people, categories…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Cashbook filter"
                  value={book}
                  onChange={(e) => setBook(e.target.value)}
                >
                  <option value="all">All cashbooks</option>
                  {currencyBooks.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Transaction type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expenses</option>
                </select>
                <select
                  aria-label="Report period"
                  value={period}
                  onChange={(e) => setRange(e.target.value)}
                >
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="all">All time</option>
                  <option value="custom">Custom dates</option>
                </select>
                <input
                  aria-label="Start date"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPeriod("custom");
                    setFrom(e.target.value);
                  }}
                />
                <input
                  aria-label="End date"
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => {
                    setPeriod("custom");
                    setTo(e.target.value);
                  }}
                />
              </div>
              <p className="print-only">
                {data.profile.name} · {from || "Beginning"} to {to || "Today"} ·{" "}
                {unit} ·{" "}
                {book === "all"
                  ? "All cashbooks"
                  : data.books.find((b) => b.id === book)?.name}
              </p>
              <div className="stats">
                <article className="stat balance">
                  <div>
                    <span>Total balance</span>
                    <Wallet size={20} />
                  </div>
                  <h2>{money(balance, unit)}</h2>
                  <small>All {unit} cashbooks · all time</small>
                  <div className="balance-decoration" />
                </article>
                <article className="stat">
                  <div>
                    <span>Money in</span>
                    <span className="stat-icon income">
                      <ArrowDownLeft size={21} />
                    </span>
                  </div>
                  <h2 className="income">{money(income, unit)}</h2>
                  <small>Income in selected period</small>
                </article>
                <article className="stat">
                  <div>
                    <span>Money out</span>
                    <span className="stat-icon expense">
                      <ArrowUpRight size={21} />
                    </span>
                  </div>
                  <h2 className="expense">{money(expense, unit)}</h2>
                  <small>Expenses in selected period</small>
                </article>
                <article className="stat">
                  <div>
                    <span>Net cash flow</span>
                    <ChartNoAxesCombined size={20} />
                  </div>
                  <h2>{money(income - expense, unit)}</h2>
                  <small>
                    {income
                      ? `${Math.round(((income - expense) / income) * 100)}% of income retained`
                      : "Your income minus expenses"}
                  </small>
                </article>
              </div>
              {page !== "Transactions" && (
                <div className="charts">
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h3>Cash flow</h3>
                        <p>Last six calendar months · current filters apply</p>
                      </div>
                      <div className="legend">
                        <span className="income">● Income</span>
                        <span className="expense">● Expenses</span>
                      </div>
                    </div>
                    <div
                      className="chart"
                      role="img"
                      aria-label="Monthly income and expense bar chart"
                    >
                      {months.map((m, i) => (
                        <div className="chart-col" key={i}>
                          <div className="bars">
                            <div
                              className="bar in"
                              style={{
                                height: `${(m.income / maxChart) * 100}%`,
                                minHeight: m.income ? 4 : 0,
                              }}
                              title={`Income ${money(m.income, unit)}`}
                            />
                            <div
                              className="bar out"
                              style={{
                                height: `${(m.expense / maxChart) * 100}%`,
                                minHeight: m.expense ? 4 : 0,
                              }}
                              title={`Expenses ${money(m.expense, unit)}`}
                            />
                          </div>
                          <small>{m.label}</small>
                        </div>
                      ))}
                    </div>
                    {!income && !expense && (
                      <small>
                        Your cash flow chart grows with each transaction.
                      </small>
                    )}
                  </section>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h3>Where it goes</h3>
                        <p>Spending by category</p>
                      </div>
                      <span className="subtle">{unit}</span>
                    </div>
                    {categoryTotals.length ? (
                      categoryTotals.slice(0, 5).map((c, i) => (
                        <div className="category" key={c.name}>
                          <div>
                            <span>
                              <i
                                style={{
                                  background: [
                                    "#397b64",
                                    "#e5ac71",
                                    "#8187bf",
                                    "#b790b5",
                                    "#82b5b0",
                                  ][i],
                                }}
                              />
                              {c.name}
                            </span>
                            <strong>{money(c.total, unit)}</strong>
                          </div>
                          <progress max={expense} value={c.total} />
                        </div>
                      ))
                    ) : (
                      <div className="category-empty">
                        <div className="donut">
                          <span>
                            0<small>expenses</small>
                          </span>
                        </div>
                        <p>Your spending story starts here.</p>
                      </div>
                    )}
                  </section>
                </div>
              )}
              <section className="card transactions">
                <div className="card-heading">
                  <div>
                    <h3>
                      {page === "Overview"
                        ? "Your transactions"
                        : "Transaction details"}{" "}
                      <span className="badge">{selected.length}</span>
                    </h3>
                    <p>Every entry, a little more clarity.</p>
                  </div>
                  <div className="no-print">
                    <button
                      onClick={() =>
                        act(async () =>
                          exportPDF(data, selected, unit, from, to),
                        )
                      }
                    >
                      <Download size={16} /> Download PDF
                    </button>
                    <button onClick={async () => window.print()}>Print</button>
                    <button
                      onClick={async () => {
                        const rows = [
                          [
                            "Date",
                            "Cashbook",
                            "Type",
                            "Category",
                            "Note",
                            "Currency",
                            "Amount",
                          ],
                          ...selected.map((t) => [
                            t.date,
                            data.books.find((b) => b.id === t.book)?.name,
                            t.transfer
                              ? `transfer ${t.type === "income" ? "in" : "out"}`
                              : t.type,
                            t.category,
                            t.note,
                            unit,
                            t.amount / 10 ** digits(unit),
                          ]),
                        ];
                        download(
                          "cashmanage-report.csv",
                          rows
                            .map((r) =>
                              r
                                .map(
                                  (v) =>
                                    '"' +
                                    String(v)
                                      .replace(/^[=+@-]/, "'$&")
                                      .replaceAll('"', '""') +
                                    '"',
                                )
                                .join(","),
                            )
                            .join("\r\n"),
                          "text/csv",
                        );
                      }}
                    >
                      CSV
                    </button>
                  </div>
                </div>
                {transactionTable}
              </section>
            </>
          )}
          {page === "Cashbooks" && (
            <>
              <div className="section-heading">
                <h3>A place for every purpose</h3>
                <button onClick={async () => setModal({ kind: "book" })}>
                  <Plus size={17} />
                  New cashbook
                </button>
              </div>
              <div className="book-grid">
                {data.books.map((b) => {
                  const ts = data.transactions.filter((t) => t.book === b.id);
                  const total = ts.reduce(
                    (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
                    0,
                  );
                  const spent = ts
                    .filter(
                      (t) =>
                        t.type === "expense" &&
                        !t.transfer &&
                        t.date.startsWith(today().slice(0, 7)),
                    )
                    .reduce((s, t) => s + t.amount, 0);
                  return (
                    <article className="card book-card" key={b.id}>
                      <div className="card-heading">
                        <span className="book-icon">
                          <Wallet />
                        </span>
                        <button
                          className="icon"
                          aria-label={`Edit ${b.name}`}
                          onClick={async () =>
                            setModal({ kind: "book", value: b })
                          }
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                      <span className="eyebrow">{b.kind}</span>
                      <h3>{b.name}</h3>
                      <h2>{money(total, b.currency)}</h2>
                      <p>
                        {b.kind.startsWith("Borrowed")
                          ? "Positive balance = remaining amount to return"
                          : b.kind.startsWith("Lent")
                            ? "Negative balance = amount still owed to you"
                            : `${ts.length} transactions · ${b.currency}`}
                      </p>
                      {b.budget > 0 && (
                        <>
                          <progress max={b.budget} value={spent} />
                          <small className={spent > b.budget ? "expense" : ""}>
                            {money(spent, b.currency)} of{" "}
                            {money(b.budget, b.currency)} monthly budget
                          </small>
                        </>
                      )}
                      <button
                        onClick={async () => {
                          setUnit(b.currency);
                          setBook(b.id);
                          setPage("Transactions");
                          setRange("all");
                        }}
                      >
                        View cashbook →
                      </button>
                    </article>
                  );
                })}
              </div>
              <div className="notice">
                Debt books: record borrowed money as income and repayments as
                expenses. Record money lent as an expense and repayments
                received as income. Add a person and due date to track who and
                when.
              </div>
            </>
          )}
          {["Planning", "Import & history", "Receipts"].includes(page) && (
            <Features data={data} save={save} act={act} page={page} />
          )}
          {page === "Shared" && <SharedBooks session={session} act={act} />}
          {page === "Overview" &&
            budgetAlerts(data, today().slice(0, 7)).map((b) => (
              <div className="notice" key={b.id}>
                {b.name}: {b.percent}% of monthly budget used
              </div>
            ))}
          {page === "Settings" && (
            <div className="settings-grid">
              <AccountSecurity
                session={session}
                data={data}
                act={act}
                lock={lock}
              />
              <section className="card">
                <h3>Your profile</h3>
                <p>Make this space your own.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.target);
                    act(async () => {
                      await save({
                        ...data,
                        profile: {
                          name: f.get("name"),
                          currency: f.get("currency"),
                          timeout: Number(f.get("timeout")),
                        },
                      });
                      setUnit(f.get("currency"));
                      setMessage("Profile updated");
                    });
                  }}
                >
                  <Field label="Display name">
                    <input
                      name="name"
                      required
                      maxLength={50}
                      defaultValue={data.profile.name}
                    />
                  </Field>
                  <Field label="Username">
                    <input
                      disabled
                      value={session.username || "Guest (temporary)"}
                    />
                  </Field>
                  <Field label="Default currency">
                    <select
                      name="currency"
                      defaultValue={data.profile.currency}
                    >
                      {currencies.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Auto-lock after inactivity">
                    <select name="timeout" defaultValue={data.profile.timeout}>
                      {[5, 15, 30, 60].map((n) => (
                        <option value={n} key={n}>
                          {n} minutes
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="primary" disabled={busy}>
                    Save profile
                  </button>
                </form>
              </section>
              <section className="card">
                <h3>Backups & devices</h3>
                <p>Encrypted copies, wherever you need them.</p>
                <div className="settings-actions">
                  <button
                    disabled={busy}
                    onClick={async () =>
                      act(async () =>
                        download(
                          `cashmanage-${today()}.json`,
                          JSON.stringify(await backup()),
                        ),
                      )
                    }
                  >
                    <Download size={18} />
                    Download encrypted backup
                  </button>
                  <label className="file-button">
                    Restore backup file
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file)
                          act(async () => {
                            if (file.size > 5000000)
                              throw new Error("Backup exceeds 5 MB");
                            await restore(JSON.parse(await file.text()));
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    disabled={busy || !online}
                    onClick={async () =>
                      act(async () => {
                        await drive("backup", await backup());
                        setMessage("Encrypted backup saved to Google Drive");
                      })
                    }
                  >
                    <Cloud size={18} />
                    Back up to Google Drive
                  </button>
                  <button
                    disabled={busy || !online}
                    onClick={async () =>
                      act(async () => restore(await drive("restore")))
                    }
                  >
                    Restore latest Drive backup
                  </button>
                  <button
                    onClick={async () =>
                      act(async () => {
                        if (!install.current)
                          throw new Error(
                            "Use your browser menu → Install app / Add to Home Screen. Installation requires HTTPS or localhost.",
                          );
                        await install.current.prompt();
                        install.current = null;
                      })
                    }
                  >
                    Install on this device
                  </button>
                </div>
                <small>
                  Drive connection requires a configured Google OAuth client.
                  Backups contain encrypted data only.
                </small>
              </section>
              <section className="card">
                <h3>Session control</h3>
                <p>
                  Online sessions expire after 24 hours. Local vaults lock after
                  inactivity.
                </p>
                <button
                  disabled={session.guest || busy}
                  onClick={async () =>
                    act(async () => setSessions(await api("/sessions")))
                  }
                >
                  Show active sessions
                </button>
                {sessions.map((s) => (
                  <p key={s.id}>
                    {s.current ? "This session" : "Other session"} · expires{" "}
                    {new Date(s.expires).toLocaleString()}
                  </p>
                ))}
                <button
                  disabled={session.guest || busy}
                  onClick={async () =>
                    act(async () => {
                      await api("/sessions", "DELETE");
                      lock();
                    })
                  }
                >
                  Sign out all online sessions
                </button>
                <small>
                  Revocation ends server access. It cannot erase an offline copy
                  from another device.
                </small>
                <button
                  disabled={session.guest}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Remove this device’s saved vault? Unsynced changes will be lost.",
                      )
                    ) {
                      localStorage.removeItem(`cm:${session.username}`);
                      lock();
                    }
                  }}
                >
                  Remove local vault
                </button>
              </section>
              <section className="card">
                <h3>Currency exchange</h3>
                <p>
                  Indicative reference rates. Cashbooks keep their original
                  currency.
                </p>
                <Currency
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
                <button
                  disabled={busy}
                  onClick={async () =>
                    act(async () => {
                      const key = `cm-rates:${unit}`;
                      try {
                        const r = await fetch(
                          `https://api.frankfurter.dev/v2/rates?base=${unit}`,
                        );
                        if (!r.ok) throw new Error("Rate unavailable");
                        const result = await r.json();
                        if (!Array.isArray(result) || !result.length)
                          throw new Error("No rates for this currency");
                        localStorage.setItem(key, JSON.stringify(result));
                        setRates(result);
                      } catch {
                        const cached = JSON.parse(
                          localStorage.getItem(key) || "null",
                        );
                        if (!cached)
                          throw new Error(
                            "Rates unavailable for this currency and no offline cache exists.",
                          );
                        setRates(cached);
                        setMessage(
                          "Showing cached rates. Check the reference date.",
                        );
                      }
                    })
                  }
                >
                  Get exchange rates
                </button>
                {rates
                  ?.filter((r) => currencies.includes(r.quote))
                  .map((r) => (
                    <div className="rate" key={r.quote}>
                      <span>
                        1 {r.base} = {r.rate} {r.quote}
                      </span>
                      <small>{r.date}</small>
                    </div>
                  ))}
                <small>
                  Source: Frankfurter. Rates may be delayed; availability
                  depends on currency.
                </small>
              </section>
            </div>
          )}
          <footer>
            <span>Built for a little more financial peace of mind.</span>
            <span>
              <ShieldCheck size={14} />{" "}
              {session.guest ? "Guest mode" : "Encrypted workspace"}
            </span>
          </footer>
        </main>
      </div>
      {conflict && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Resolve sync conflict"
          >
            <h2>Review device and cloud versions</h2>
            <p>
              Choose which values to keep. Entries present in only one version
              are kept unless you select Delete. Download a backup before
              resolving deletions or linked transfers.
            </p>
            <button
              onClick={async () =>
                act(async () =>
                  download(
                    "conflict-device-backup.json",
                    JSON.stringify(await backup()),
                  ),
                )
              }
            >
              Download device backup
            </button>
            <label className="field">
              Profile
              <select
                onChange={(e) =>
                  setConflict({
                    ...conflict,
                    choices: { ...conflict.choices, profile: e.target.value },
                  })
                }
              >
                <option value="remote">Cloud profile</option>
                <option value="local">Device profile</option>
              </select>
            </label>
            {["books", "transactions", "recurring", "goals", "debts"].flatMap(
              (field) => {
                const localMap = new Map(
                    (data[field] || []).map((x) => [x.id, x]),
                  ),
                  remoteMap = new Map(
                    (conflict.remoteData[field] || []).map((x) => [x.id, x]),
                  );
                return [...new Set([...localMap.keys(), ...remoteMap.keys()])]
                  .filter(
                    (id) =>
                      JSON.stringify(localMap.get(id)) !==
                      JSON.stringify(remoteMap.get(id)),
                  )
                  .map((id) => (
                    <div className="field" key={field + id}>
                      <strong>
                        {field}:{" "}
                        {localMap.get(id)?.note ||
                          localMap.get(id)?.name ||
                          remoteMap.get(id)?.note ||
                          id}
                      </strong>
                      <small>
                        Device:{" "}
                        {JSON.stringify(localMap.get(id) || "absent").slice(
                          0,
                          250,
                        )}
                      </small>
                      <small>
                        Cloud:{" "}
                        {JSON.stringify(remoteMap.get(id) || "absent").slice(
                          0,
                          250,
                        )}
                      </small>
                      <select
                        value={conflict.choices[field + ":" + id] || "remote"}
                        onChange={(e) =>
                          setConflict({
                            ...conflict,
                            choices: {
                              ...conflict.choices,
                              [field + ":" + id]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="remote">
                          Cloud value (keep device-only entry)
                        </option>
                        <option value="local">Device value</option>
                        {field === "transactions" && (
                          <option value="delete">Delete entry</option>
                        )}
                      </select>
                    </div>
                  ));
              },
            )}
            <button
              className="primary"
              onClick={async () =>
                act(async () => {
                  const merged = mergeVersions(
                    data,
                    conflict.remoteData,
                    conflict.choices,
                  );
                  await save(
                    merged,
                    "Resolved synchronization conflict",
                    conflict.remote.revision,
                  );
                  setConflict(null);
                  setMessage(
                    "Merged locally. Automatic sync will upload the result.",
                  );
                })
              }
            >
              Save resolution
            </button>
            <button
              onClick={async () => {
                setConflict(null);
                lock();
              }}
            >
              Lock and resolve later
            </button>
          </section>
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
          >
            <div className="card-heading">
              <h2 id="modal-title">
                {modal.value ? "Edit" : "New"}{" "}
                {modal.kind === "book" ? "cashbook" : "transaction"}
              </h2>
              <button
                aria-label="Close dialog"
                className="icon"
                onClick={async () => setModal(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.target));
                act(async () => {
                  if (modal.kind === "book") {
                    const value = {
                      ...f,
                      id: modal.value?.id || crypto.randomUUID(),
                      budget: Math.round(
                        Number(f.budget || 0) * 10 ** digits(f.currency),
                      ),
                    };
                    await save({
                      ...data,
                      books: modal.value
                        ? data.books.map((b) => (b.id === value.id ? value : b))
                        : [...data.books, value],
                    });
                  } else {
                    const b = data.books.find((b) => b.id === f.book);
                    const amount = Math.round(
                      Number(f.amount) * 10 ** digits(b.currency),
                    );
                    if (!Number.isSafeInteger(amount) || amount <= 0)
                      throw new Error("Enter a valid positive amount");
                    const value = {
                      ...modal.value,
                      ...f,
                      amount,
                      id: modal.value?.id || crypto.randomUUID(),
                    };
                    await save({
                      ...data,
                      transactions: modal.value
                        ? data.transactions.map((t) =>
                            t.id === value.id ? value : t,
                          )
                        : [...data.transactions, value],
                    });
                  }
                  setModal(null);
                });
              }}
            >
              {modal.kind === "book" ? (
                <>
                  <Field label="Cashbook name">
                    <input
                      autoFocus
                      name="name"
                      required
                      maxLength={50}
                      defaultValue={modal.value?.name}
                    />
                  </Field>
                  <Field label="Purpose">
                    <select name="kind" defaultValue={modal.value?.kind}>
                      {kinds.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Currency (fixed after creation)">
                    <select
                      name="currency"
                      defaultValue={modal.value?.currency || unit}
                    >
                      {(modal.value ? [modal.value.currency] : currencies).map(
                        (c) => (
                          <option key={c}>{c}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Monthly expense budget (0 = no budget)">
                    <input
                      type="number"
                      name="budget"
                      min="0"
                      max="1000000000"
                      step="0.01"
                      defaultValue={
                        modal.value
                          ? modal.value.budget /
                            10 ** digits(modal.value.currency)
                          : 0
                      }
                    />
                  </Field>
                </>
              ) : (
                <>
                  <div className="form-row">
                    <Field label="Type">
                      <select
                        name="type"
                        defaultValue={modal.value?.type || "expense"}
                      >
                        <option value="income">Income (+)</option>
                        <option value="expense">Expense (−)</option>
                      </select>
                    </Field>
                    <Field label="Cashbook">
                      <select
                        name="book"
                        defaultValue={
                          modal.value?.book ||
                          (book !== "all" ? book : data.books[0].id)
                        }
                      >
                        {data.books.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.currency})
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="form-row">
                    <Field label="Amount">
                      <input
                        autoFocus
                        name="amount"
                        required
                        type="number"
                        min="0.01"
                        max="1000000000"
                        step="0.01"
                        defaultValue={
                          modal.value
                            ? modal.value.amount /
                              10 **
                                digits(
                                  data.books.find(
                                    (b) => b.id === modal.value.book,
                                  ).currency,
                                )
                            : ""
                        }
                      />
                    </Field>
                    <Field label="Date">
                      <input
                        name="date"
                        type="date"
                        required
                        defaultValue={modal.value?.date || today()}
                      />
                    </Field>
                  </div>
                  <Field label="Category">
                    <select
                      name="category"
                      defaultValue={modal.value?.category}
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Description">
                    <input
                      name="note"
                      maxLength={200}
                      placeholder="What was it for?"
                      defaultValue={modal.value?.note}
                    />
                  </Field>
                  <div className="form-row">
                    <Field label="Person (optional)">
                      <input
                        name="person"
                        maxLength={80}
                        defaultValue={modal.value?.person}
                      />
                    </Field>
                    <Field label="Due date (optional)">
                      <input
                        name="due"
                        type="date"
                        defaultValue={modal.value?.due}
                      />
                    </Field>
                  </div>
                </>
              )}
              <button className="primary wide" disabled={busy}>
                {busy ? "Saving…" : "Save " + modal.kind}
              </button>
              {message && <p role="alert">{message}</p>}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
