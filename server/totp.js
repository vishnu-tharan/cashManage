const crypto = require("node:crypto");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encode(buffer) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of buffer) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode(text) {
  let bits = 0,
    value = 0,
    out = [];
  for (const c of text) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid secret");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret, counter) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", decode(secret)).update(b).digest();
  const offset = h[19] & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
module.exports = { encode, totp };
