import { ask, confirmAction } from "./dialogs";
import { useState } from "react";
import { api, derive, proof, seal, randomSalt, download } from "./storage";
const hex = (b) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
async function digest(s) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
  );
}
export default function AccountSecurity({ session, data, act, lock }) {
  const [state, setState] = useState(null),
    [setup, setSetup] = useState(null);
  const credentials = async () => {
    const password = await ask("Current account password:");
    if (!password) throw new Error("Cancelled");
    return {
      proof: await proof(session.username, password),
      code:
        (await ask("Authenticator code (leave empty if MFA is disabled):")) ||
        "",
    };
  };
  return (
    <section className="card">
      <h3>Account protection</h3>
      <p>
        Authenticator MFA protects online sign-in. Offline unlock still uses the
        vault password.
      </p>
      <button
        disabled={session.guest}
        onClick={async () => act(async () => setState(await api("/security")))}
      >
        Check security settings
      </button>
      {state && (
        <p>
          MFA: {state.mfa ? "enabled" : "off"} · Recovery key:{" "}
          {state.recovery ? "configured" : "not configured"}
        </p>
      )}
      <div className="settings-actions">
        <button
          disabled={session.guest}
          onClick={async () =>
            act(async () => {
              const c = await credentials();
              setSetup(await api("/security/mfa/setup", "POST", c));
            })
          }
        >
          Set up authenticator
        </button>
        {setup && (
          <div className="notice">
            <div>
              <p>
                Add this setup key to an authenticator app (time based, 6
                digits):
              </p>
              <code>{setup.secret}</code>
              <button
                onClick={async () =>
                  act(async () => {
                    await api("/security/mfa/enable", "POST", {
                      code: await ask("Enter the current 6-digit code:"),
                    });
                    setSetup(null);
                    setState(await api("/security"));
                  })
                }
              >
                Verify and enable MFA
              </button>
            </div>
          </div>
        )}
        <button
          disabled={session.guest}
          onClick={async () =>
            act(async () => {
              await api("/security/mfa/disable", "POST", await credentials());
              setState(await api("/security"));
            })
          }
        >
          Disable MFA
        </button>
        <button
          disabled={session.guest}
          onClick={async () =>
            act(async () => {
              const c = await credentials();
              const recoveryKey = hex(
                  crypto.getRandomValues(new Uint8Array(32)),
                ),
                salt = randomSalt();
              const raw = hex(
                await crypto.subtle.exportKey("raw", session.key),
              );
              const envelope = await seal(
                { raw, salt: session.salt },
                await derive(recoveryKey, salt),
                salt,
              );
              await api("/security/recovery", "POST", {
                ...c,
                recoveryProof: await digest(recoveryKey),
                envelope,
              });
              download(
                "cashmanage-recovery-key.txt",
                `CashManage recovery key\nUsername: ${session.username}\nKey: ${recoveryKey}\nKeep this key offline. It can reset your password and MFA.\n`,
                "text/plain",
              );
              setState(await api("/security"));
            })
          }
        >
          Generate recovery key file
        </button>
        <button
          disabled={session.guest}
          onClick={async () =>
            act(async () => {
              if (
                !(await confirmAction(
                  "Changing password signs out all devices and invalidates the current recovery key. Continue?",
                ))
              )
                return;
              const c = await credentials(),
                password = await ask("New password (at least 12 characters):");
              if (!password || password.length < 12)
                throw new Error("Use at least 12 characters");
              const saved = JSON.parse(
                localStorage.getItem(`cm:${session.username}`),
              );
              if (saved.dirty)
                throw new Error("Sync your changes before changing password");
              const salt = randomSalt(),
                vault = await seal(data, await derive(password, salt), salt);
              const result = await api("/security/password", "POST", {
                ...c,
                newProof: await proof(session.username, password),
                vault,
                revision: saved.revision,
              });
              localStorage.setItem(
                `cm:${session.username}`,
                JSON.stringify({
                  vault,
                  revision: result.revision,
                  dirty: false,
                }),
              );
              lock();
            })
          }
        >
          Change password
        </button>
      </div>
      <small>
        After changing your password, generate a new recovery key. Old device
        backups remain readable with the old password.
      </small>
    </section>
  );
}
