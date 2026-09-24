const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  encode,
  totp
} = require("./totp");
module.exports = function security({
  app,
  run,
  get,
  all,
  scrypt,
  validVault,
  hash
}) {
  let key;
  async function init() {
    if (process.env.DB_PATH === ":memory:") key = crypto.randomBytes(32);else {
      const file = process.env.MFA_KEY_PATH || path.join(__dirname, ".mfa-key");
      try {
        key = fs.readFileSync(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        key = crypto.randomBytes(32);
        try {
          fs.writeFileSync(file, key, {
            flag: "wx",
            mode: 0o600
          });
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          key = fs.readFileSync(file);
        }
      }
      if (key.length !== 32) throw new Error("Invalid MFA encryption key");
    }
    await run("CREATE TABLE IF NOT EXISTS security(username TEXT PRIMARY KEY,secret TEXT,pending TEXT,lastCounter INTEGER DEFAULT -1,recoveryHash TEXT,recoveryEnvelope TEXT)");
    await run("CREATE TABLE IF NOT EXISTS shared(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,vault TEXT NOT NULL,revision INTEGER DEFAULT 0)");
    await run("CREATE TABLE IF NOT EXISTS members(book TEXT NOT NULL,username TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(book,username))");
  }
  function encrypt(secret) {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([iv, c.update(secret), c.final(), c.getAuthTag()]).toString("hex");
  }
  function decrypt(value) {
    const b = Buffer.from(value, "hex"),
      d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(-16));
    return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
  }
  async function verifyMfa(username, code) {
    const row = await get("SELECT * FROM security WHERE username=?", [username]);
    if (!row?.secret) return true;
    if (!/^\d{6}$/.test(code || "")) return false;
    const step = Math.floor(Date.now() / 30000);
    for (const n of [step - 1, step, step + 1]) {
      if (n > row.lastCounter && totp(decrypt(row.secret), n) === code) {
        const r = await run("UPDATE security SET lastCounter=? WHERE username=? AND lastCounter<?", [n, username, n]);
        return !!r.changes;
      }
    }
    return false;
  }
  async function verifyPassword(username, proof) {
    if (!/^[a-f0-9]{64}$/.test(proof || "")) return false;
    const u = await get("SELECT * FROM users WHERE username=?", [username]);
    return u && crypto.timingSafeEqual(await scrypt(proof, u.salt, 64), Buffer.from(u.password, "hex"));
  }
  function publicRoutes() {
    require("./routes/recovery")({
      app,
      get,
      crypto,
      hash,
      validVault,
      scrypt,
      run
    });
  }
  function privateRoutes() {
    require("./routes/security")({
      app,
      get,
      verifyPassword,
      encode,
      crypto,
      run,
      encrypt,
      totp,
      decrypt,
      verifyMfa,
      validVault,
      hash,
      scrypt
    });
    require("./routes/sharedBooks")({
      app,
      all,
      validVault,
      crypto,
      run,
      get
    });
  }
  return {
    init,
    verifyMfa,
    publicRoutes,
    privateRoutes
  };
};
