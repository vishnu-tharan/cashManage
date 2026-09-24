import { recoverAccount } from "../recovery";
import { upgrade } from "../ledger";
import { Wallet, ShieldCheck } from "lucide-react";
import { initial } from "../storage";
import { Field } from "../components/forms";
export default function AuthPage({
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
  message
}) {
  return <div className="auth">
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
              {authMode === "register" ? "Make room for clarity." : "Good to see you."}
            </h2>
            <p>
              {authMode === "offline" ? "Unlock the encrypted account saved on this device." : "A clearer picture of your money starts here."}
            </p>
            <form id="login-form" onSubmit={authenticate}>
              <Field label="Unique username">
                <input name="username" required pattern="[A-Za-z0-9_]{3,24}" minLength={3} maxLength={24} autoComplete="username" placeholder="Your username" />
              </Field>
              <Field label="Password">
                <input name="password" type="password" required minLength={authMode === "register" ? 12 : 1} maxLength={128} autoComplete={authMode === "register" ? "new-password" : "current-password"} placeholder={authMode === "register" ? "At least 12 characters" : "Your password"} />
              </Field>
              {authMode === "register" && <small>
                  Your password encrypts your data. There is no recovery without
                  a recovery key. Generate one in Settings after signing in.
                </small>}
              <button className="primary wide" disabled={busy}>
                {busy ? "Unlocking…" : authMode === "register" ? "Create account →" : "Unlock my cashbooks →"}
              </button>
            </form>
            {authMode === "login" && <Field label="Authenticator code (if enabled)">
                <input name="otp" form="login-form" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} />
              </Field>}
            <button onClick={async () => act(async () => setMessage(await recoverAccount()))}>
              Recover account with recovery key
            </button>
            <div className="auth-links">
              {["login", "register", "offline"].map(m => <button key={m} onClick={async () => setAuthMode(m)} disabled={authMode === m}>
                  {m === "login" ? "Sign in" : m === "register" ? "Create account" : "Offline unlock"}
                </button>)}
            </div>
            <div className="divider">or explore first</div>
            <button className="wide" onClick={async () => {
          const s = {
            guest: true
          };
          sessionRef.current = s;
          setSession(s);
          setData(upgrade(initial()));
          setStatus("Guest · temporary");
        }}>
              Continue as guest
            </button>
            <small>
              Guest data is temporary. Export a backup before closing or
              locking.
            </small>
            {message && <div role="alert" className="notice">
                {message}
              </div>}
          </div>
        </div>
      </div>;
}
