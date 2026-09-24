import { validateData } from "../domain/validation.js";
const enc = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const bytes = h => Uint8Array.from(h.match(/.{2}/g) || [], c => parseInt(c, 16));
export const randomSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export async function derive(password, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "PBKDF2",
    salt: bytes(salt),
    iterations: 600000,
    hash: "SHA-256"
  }, base, {
    name: "AES-GCM",
    length: 256
  }, true, ["encrypt", "decrypt"]);
}
export async function proof(username, password) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: enc.encode(`cashmanage-auth:${username}`),
    iterations: 600000,
    hash: "SHA-256"
  }, base, 256));
}
export async function seal(data, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    version: 1,
    salt,
    iv: hex(iv),
    cipher: hex(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv
    }, key, enc.encode(JSON.stringify(data))))
  };
}
export async function unseal(vault, key) {
  const data = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: bytes(vault.iv)
  }, key, bytes(vault.cipher))));
  return validateData(data);
}
