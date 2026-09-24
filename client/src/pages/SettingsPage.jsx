import { confirmAction } from "../dialogs";
import AccountSecurity from "../AccountSecurity";
import { Download, Cloud } from "lucide-react";
import { api, currencies, today, download, drive } from "../storage";
import { Field, Currency } from "../components/forms";
export default function SettingsPage({
  session,
  data,
  act,
  lock,
  save,
  setUnit,
  setMessage,
  busy,
  backup,
  restore,
  online,
  install,
  setSessions,
  sessions,
  unit,
  setRates,
  rates
}) {
  return <div className="settings-grid">
              <AccountSecurity session={session} data={data} act={act} lock={lock} />
              <section className="card">
                <h3>Your profile</h3>
                <p>Make this space your own.</p>
                <form onSubmit={e => {
        e.preventDefault();
        const f = new FormData(e.target);
        act(async () => {
          await save({
            ...data,
            profile: {
              name: f.get("name"),
              currency: f.get("currency"),
              timeout: Number(f.get("timeout"))
            }
          });
          setUnit(f.get("currency"));
          setMessage("Profile updated");
        });
      }}>
                  <Field label="Display name">
                    <input name="name" required maxLength={50} defaultValue={data.profile.name} />
                  </Field>
                  <Field label="Username">
                    <input disabled value={session.username || "Guest (temporary)"} />
                  </Field>
                  <Field label="Default currency">
                    <select name="currency" defaultValue={data.profile.currency}>
                      {currencies.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Auto-lock after inactivity">
                    <select name="timeout" defaultValue={data.profile.timeout}>
                      {[5, 15, 30, 60].map(n => <option value={n} key={n}>
                          {n} minutes
                        </option>)}
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
                  <button disabled={busy} onClick={async () => act(async () => download(`cashmanage-${today()}.json`, JSON.stringify(await backup())))}>
                    <Download size={18} />
                    Download encrypted backup
                  </button>
                  <label className="file-button">
                    Restore backup file
                    <input type="file" accept="application/json,.json" onChange={e => {
            const file = e.target.files[0];
            if (file) act(async () => {
              if (file.size > 5000000) throw new Error("Backup exceeds 5 MB");
              await restore(JSON.parse(await file.text()));
            });
            e.target.value = "";
          }} />
                  </label>
                  <button disabled={busy || !online} onClick={async () => act(async () => {
          await drive("backup", await backup());
          setMessage("Encrypted backup saved to Google Drive");
        })}>
                    <Cloud size={18} />
                    Back up to Google Drive
                  </button>
                  <button disabled={busy || !online} onClick={async () => act(async () => restore(await drive("restore")))}>
                    Restore latest Drive backup
                  </button>
                  <button onClick={async () => act(async () => {
          if (!install.current) throw new Error("Use your browser menu → Install app / Add to Home Screen. Installation requires HTTPS or localhost.");
          await install.current.prompt();
          install.current = null;
        })}>
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
                <button disabled={session.guest || busy} onClick={async () => act(async () => setSessions(await api("/sessions")))}>
                  Show active sessions
                </button>
                {sessions.map(s => <p key={s.id}>
                    {s.current ? "This session" : "Other session"} · expires{" "}
                    {new Date(s.expires).toLocaleString()}
                  </p>)}
                <button disabled={session.guest || busy} onClick={async () => act(async () => {
        await api("/sessions", "DELETE");
        lock();
      })}>
                  Sign out all online sessions
                </button>
                <small>
                  Revocation ends server access. It cannot erase an offline copy
                  from another device.
                </small>
                <button disabled={session.guest} onClick={async () => {
        if (await confirmAction("Remove this device’s saved vault? Unsynced changes will be lost.")) {
          localStorage.removeItem(`cm:${session.username}`);
          lock();
        }
      }}>
                  Remove local vault
                </button>
              </section>
              <section className="card">
                <h3>Currency exchange</h3>
                <p>
                  Indicative reference rates. Cashbooks keep their original
                  currency.
                </p>
                <Currency value={unit} onChange={e => setUnit(e.target.value)} />
                <button disabled={busy} onClick={async () => act(async () => {
        const key = `cm-rates:${unit}`;
        try {
          const r = await fetch(`https://api.frankfurter.dev/v2/rates?base=${unit}`);
          if (!r.ok) throw new Error("Rate unavailable");
          const result = await r.json();
          if (!Array.isArray(result) || !result.length) throw new Error("No rates for this currency");
          localStorage.setItem(key, JSON.stringify(result));
          setRates(result);
        } catch {
          const cached = JSON.parse(localStorage.getItem(key) || "null");
          if (!cached) throw new Error("Rates unavailable for this currency and no offline cache exists.");
          setRates(cached);
          setMessage("Showing cached rates. Check the reference date.");
        }
      })}>
                  Get exchange rates
                </button>
                {rates?.filter(r => currencies.includes(r.quote)).map(r => <div className="rate" key={r.quote}>
                      <span>
                        1 {r.base} = {r.rate} {r.quote}
                      </span>
                      <small>{r.date}</small>
                    </div>)}
                <small>
                  Source: Frankfurter. Rates may be delayed; availability
                  depends on currency.
                </small>
              </section>
            </div>;
}
