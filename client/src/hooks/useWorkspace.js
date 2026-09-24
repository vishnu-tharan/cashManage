import { getDialog } from "../dialogs";
import { ask, confirmAction } from "../dialogs";
import { validateData } from "../storage";
import { upgrade, record, postRecurring } from "../ledger";
import { useEffect, useRef, useState } from "react";
import { api, derive, proof, seal, unseal, randomSalt, initial, today } from "../storage";
export default function useWorkspace() {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState("Overview");
  const [theme, setTheme] = useState(() => localStorage.getItem("cm-theme") || "light");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [book, setBook] = useState("all");
  const [type, setType] = useState("all");
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [unit, setUnit] = useState("LKR");
  const [status, setStatus] = useState("Local only");
  const [sessions, setSessions] = useState([]);
  const [rates, setRates] = useState(null);
  const [menu, setMenu] = useState(false);
  const [conflict, setConflict] = useState(null);
  const operationRunning = useRef(false);
  const syncRunning = useRef(false);
  const latest = useRef(null);
  const [authMode, setAuthMode] = useState("login");
  const sessionRef = useRef(null);
  const install = useRef(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const key = e => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = [...document.querySelectorAll('[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] select')];
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
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
    const changed = e => {
      if (sessionRef.current?.username && e.key === `cm:${sessionRef.current.username}`) {
        sessionRef.current = null;
        setSession(null);
        setData(null);
        setModal(null);
        setMessage("Another tab updated this vault. Unlock again to use the latest local copy.");
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
    const prompt = e => {
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
    sessionRef.current = null;
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
        sessionRef.current = null;
        setSession(null);
        setData(null);
        setModal(null);
        setMessage("Session locked after inactivity.");
      }, data.profile.timeout * 60000);
    };
    reset();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach(e => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [session, data?.profile.timeout]);
  const act = async fn => {
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
    const username = String(form.get("username")).toLowerCase().trim();
    const password = String(form.get("password"));
    await act(async () => {
      let saved = JSON.parse(localStorage.getItem(`cm:${username}`) || "null");
      let vault;
      let revision = 0;
      if (authMode === "register") {
        const salt = randomSalt();
        const key = await derive(password, salt);
        vault = await seal(initial(username), key, salt);
        const result = await api("/auth/register", "POST", {
          username,
          proof: await proof(username, password),
          vault
        });
        revision = result.revision;
        saved = {
          vault,
          revision,
          dirty: false
        };
      } else if (authMode === "offline") {
        if (!saved) throw new Error("No saved vault on this device. Sign in online first.");
      } else {
        const result = await api("/auth/login", "POST", {
          username,
          proof: await proof(username, password),
          otp: String(form.get("otp") || "")
        });
        if (!saved?.dirty) saved = {
          ...result,
          dirty: false
        };
      }
      const key = await derive(password, saved.vault.salt);
      let opened;
      try {
        opened = await unseal(saved.vault, key);
      } catch {
        throw new Error("Unable to unlock vault. Check your password.");
      }
      localStorage.setItem(`cm:${username}`, JSON.stringify(saved));
      const s = {
        username,
        key,
        salt: saved.vault.salt,
        guest: false
      };
      sessionRef.current = s;
      setSession(s);
      setData(upgrade(opened));
      setUnit(opened.profile.currency);
      setStatus(saved.dirty ? "Changes pending sync" : authMode === "offline" ? "Unlocked offline" : "Synced");
    });
  }
  async function save(next, label = "Updated workspace", revision) {
    next = validateData(record(data, next, label));
    const s = sessionRef.current;
    if (!s) throw new Error("Please unlock your vault");
    if (!s.guest) {
      const old = JSON.parse(localStorage.getItem(`cm:${s.username}`));
      const vault = await seal(next, s.key, s.salt);
      if (JSON.stringify(vault).length > 4500000) throw new Error("Vault is too large. Remove old receipts or export and clear activity history.");
      if (sessionRef.current !== s) return;
      localStorage.setItem(`cm:${s.username}`, JSON.stringify({
        ...old,
        vault,
        revision: revision ?? old.revision,
        dirty: true
      }));
    }
    if (sessionRef.current !== s) return;
    setData(next);
    setStatus(s.guest ? "Guest · temporary" : "Saved on device · sync pending");
  }
  async function sync() {
    if (syncRunning.current || conflict) return;
    syncRunning.current = true;
    try {
      const s = sessionRef.current;
      if (s.guest) throw new Error("Guest data stays in memory. Export a backup before leaving.");
      const saved = JSON.parse(localStorage.getItem(`cm:${s.username}`));
      if (saved.dirty) {
        const result = await api("/vault", "PUT", {
          vault: saved.vault,
          revision: saved.revision
        });
        if (sessionRef.current !== s) return;
        const newest = JSON.parse(localStorage.getItem(`cm:${s.username}`));
        const changed = newest.vault.cipher !== saved.vault.cipher;
        localStorage.setItem(`cm:${s.username}`, JSON.stringify({
          ...newest,
          ...result,
          dirty: changed
        }));
      } else {
        const result = await api("/vault");
        const opened = await unseal(result.vault, s.key);
        if (sessionRef.current !== s) return;
        if (JSON.parse(localStorage.getItem(`cm:${s.username}`)).dirty) return;
        localStorage.setItem(`cm:${s.username}`, JSON.stringify({
          ...result,
          dirty: false
        }));
        setData(upgrade(opened));
      }
      setStatus("Synced");
    } catch (e) {
      if (e.status === 409 && sessionRef.current) {
        const active = sessionRef.current;
        const remote = await api("/vault");
        if (sessionRef.current !== active) return;
        const remoteData = await unseal(remote.vault, active.key);
        if (sessionRef.current !== active) return;
        setConflict({
          remote,
          remoteData,
          choices: {}
        });
        setStatus("Sync conflict needs review");
      } else throw e;
    } finally {
      syncRunning.current = false;
    }
  }
  useEffect(() => {
    latest.current = {
      data,
      session,
      busy,
      conflict,
      sync,
      save
    };
  });
  useEffect(() => {
    const timer = setInterval(async () => {
      const value = latest.current;
      if (!value?.session || value.busy || getDialog() || operationRunning.current || value.conflict || syncRunning.current) return;
      operationRunning.current = true;
      try {
        const posted = postRecurring(value.data, today());
        if (posted.count) {
          operationRunning.current = true;
          await value.save(posted.data, `Posted ${posted.count} recurring entries`);
          return;
        }
        if (!value.session.guest && navigator.onLine) await value.sync();
      } catch (e) {
        setStatus(e.status === 401 ? "Online session expired; unlock online to reconnect" : "Saved locally · sync unavailable");
      } finally {
        operationRunning.current = false;
      }
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  async function backup() {
    if (!session.guest) return JSON.parse(localStorage.getItem(`cm:${session.username}`)).vault;
    const password = await ask("Choose a backup password (at least 12 characters). Keep it to restore this backup.");
    if (!password || password.length < 12) throw new Error("Backup password must have at least 12 characters");
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
    if (await confirmAction("Replace your current cashbooks with this backup? Export your current data first if needed.")) {
      await save(restored);
      setMessage("Backup restored locally. Sync to update your account.");
    }
  }
  return {
    session,
    data,
    authMode,
    authenticate,
    busy,
    act,
    setMessage,
    setAuthMode,
    sessionRef,
    setSession,
    setData,
    setStatus,
    message,
    unit,
    book,
    type,
    from,
    to,
    search,
    setPeriod,
    setFrom,
    setTo,
    setModal,
    save,
    menu,
    page,
    setPage,
    setMenu,
    lock,
    online,
    setTheme,
    theme,
    status,
    setUnit,
    setBook,
    sync,
    setSearch,
    setType,
    period,
    backup,
    restore,
    install,
    setSessions,
    sessions,
    setRates,
    rates,
    conflict,
    setConflict,
    modal
  };
}
