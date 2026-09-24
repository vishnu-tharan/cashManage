import { ask } from "./dialogs";
import { api, derive, proof, seal, randomSalt } from "./storage";
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
const bytes = h => Uint8Array.from(h.match(/.{2}/g), c => parseInt(c, 16));
async function digest(s) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
export async function recoverAccount() {
  const username = (await ask("Account username:"))?.toLowerCase().trim();
  const key = (await ask("Recovery key from your saved file:"))?.trim();
  if (!username || !key) throw new Error("Recovery cancelled");
  const recoveryProof = await digest(key);
  const r = await api("/auth/recovery", "POST", {
    username,
    recoveryProof
  });
  const decrypt = async (v, k) => JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: bytes(v.iv)
  }, k, bytes(v.cipher))));
  const envelope = await decrypt(r.envelope, await derive(key, r.envelope.salt));
  const oldKey = await crypto.subtle.importKey("raw", bytes(envelope.raw), "AES-GCM", true, ["encrypt", "decrypt"]);
  const data = await decrypt(r.vault, oldKey);
  const password = await ask("New password (at least 12 characters):");
  if (!password || password.length < 12) throw new Error("Use at least 12 characters");
  const salt = randomSalt();
  const vault = await seal(data, await derive(password, salt), salt);
  await api("/auth/recovery", "POST", {
    username,
    recoveryProof,
    newProof: await proof(username, password),
    vault,
    revision: r.revision
  });
  localStorage.setItem(`cm:${username}`, JSON.stringify({
    vault,
    revision: r.revision + 1,
    dirty: false
  }));
  return "Password reset. Sign in with your new password and configure MFA and a new recovery key.";
}
