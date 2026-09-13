const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { encode, totp } = require("./totp");
module.exports = function security({
  app,
  run,
  get,
  all,
  scrypt,
  validVault,
  hash,
}) {
  let key;
  async function init() {
    if (process.env.DB_PATH === ":memory:") key = crypto.randomBytes(32);
    else {
      const file = process.env.MFA_KEY_PATH || path.join(__dirname, ".mfa-key");
      try {
        key = fs.readFileSync(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        key = crypto.randomBytes(32);
        try {
          fs.writeFileSync(file, key, { flag: "wx", mode: 0o600 });
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          key = fs.readFileSync(file);
        }
      }
      if (key.length !== 32) throw new Error("Invalid MFA encryption key");
    }
    await run(
      "CREATE TABLE IF NOT EXISTS security(username TEXT PRIMARY KEY,secret TEXT,pending TEXT,lastCounter INTEGER DEFAULT -1,recoveryHash TEXT,recoveryEnvelope TEXT)",
    );
    await run(
      "CREATE TABLE IF NOT EXISTS shared(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,vault TEXT NOT NULL,revision INTEGER DEFAULT 0)",
    );
    await run(
      "CREATE TABLE IF NOT EXISTS members(book TEXT NOT NULL,username TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(book,username))",
    );
  }
  function encrypt(secret) {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([
      iv,
      c.update(secret),
      c.final(),
      c.getAuthTag(),
    ]).toString("hex");
  }
  function decrypt(value) {
    const b = Buffer.from(value, "hex"),
      d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(-16));
    return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
  }
  async function verifyMfa(username, code) {
    const row = await get("SELECT * FROM security WHERE username=?", [
      username,
    ]);
    if (!row?.secret) return true;
    if (!/^\d{6}$/.test(code || "")) return false;
    const step = Math.floor(Date.now() / 30000);
    for (const n of [step - 1, step, step + 1]) {
      if (n > row.lastCounter && totp(decrypt(row.secret), n) === code) {
        const r = await run(
          "UPDATE security SET lastCounter=? WHERE username=? AND lastCounter<?",
          [n, username, n],
        );
        return !!r.changes;
      }
    }
    return false;
  }
  async function verifyPassword(username, proof) {
    if (!/^[a-f0-9]{64}$/.test(proof || "")) return false;
    const u = await get("SELECT * FROM users WHERE username=?", [username]);
    return (
      u &&
      crypto.timingSafeEqual(
        await scrypt(proof, u.salt, 64),
        Buffer.from(u.password, "hex"),
      )
    );
  }
  function publicRoutes() {
    app.post("/api/auth/recovery", async (req, res) => {
      const { username, recoveryProof, newProof, vault, revision } = req.body;
      if (!/^[a-f0-9]{64}$/.test(recoveryProof || ""))
        return res.status(400).json({ error: "Invalid recovery key" });
      const row = await get("SELECT * FROM security WHERE username=?", [
        username,
      ]);
      if (
        !row?.recoveryHash ||
        !crypto.timingSafeEqual(
          Buffer.from(hash(recoveryProof), "hex"),
          Buffer.from(row.recoveryHash, "hex"),
        )
      )
        return res.status(401).json({ error: "Invalid recovery credentials" });
      const user = await get("SELECT * FROM users WHERE username=?", [
        username,
      ]);
      if (!newProof)
        return res.json({
          vault: JSON.parse(user.vault),
          envelope: JSON.parse(row.recoveryEnvelope),
          revision: user.revision,
        });
      if (
        !/^[a-f0-9]{64}$/.test(newProof) ||
        !validVault(vault) ||
        revision !== user.revision
      )
        return res
          .status(409)
          .json({ error: "Invalid reset or account changed; retry recovery" });
      const salt = crypto.randomBytes(16).toString("hex"),
        password = (await scrypt(newProof, salt, 64)).toString("hex");
      const changed = await run(
        "UPDATE users SET password=?,salt=?,vault=?,revision=revision+1 WHERE username=? AND revision=?",
        [password, salt, JSON.stringify(vault), username, revision],
      );
      if (!changed.changes)
        return res
          .status(409)
          .json({ error: "Account changed; retry recovery" });
      await run("DELETE FROM security WHERE username=?", [username]);
      await run("DELETE FROM sessions WHERE username=?", [username]);
      res.json({ ok: true });
    });
  }
  function privateRoutes() {
    app.get("/api/security", async (req, res) => {
      const s = await get("SELECT * FROM security WHERE username=?", [
        req.username,
      ]);
      res.json({ mfa: !!s?.secret, recovery: !!s?.recoveryHash });
    });
    app.post("/api/security/mfa/setup", async (req, res) => {
      if (!(await verifyPassword(req.username, req.body.proof)))
        return res.status(401).json({ error: "Incorrect password" });
      const s = await get("SELECT * FROM security WHERE username=?", [
        req.username,
      ]);
      if (s?.secret)
        return res.status(409).json({ error: "MFA is already enabled" });
      const secret = encode(crypto.randomBytes(20));
      await run(
        "INSERT INTO security(username,pending) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET pending=excluded.pending",
        [req.username, encrypt(secret)],
      );
      res.json({
        secret,
        uri: `otpauth://totp/CashManage:${req.username}?secret=${secret}&issuer=CashManage&algorithm=SHA1&digits=6&period=30`,
      });
    });
    app.post("/api/security/mfa/enable", async (req, res) => {
      const s = await get("SELECT * FROM security WHERE username=?", [
        req.username,
      ]);
      const counter = Math.floor(Date.now() / 30000);
      if (!s?.pending || totp(decrypt(s.pending), counter) !== req.body.code)
        return res.status(400).json({ error: "Invalid authenticator code" });
      await run(
        "UPDATE security SET secret=pending,pending=NULL,lastCounter=? WHERE username=?",
        [counter, req.username],
      );
      await run("DELETE FROM sessions WHERE username=? AND token<>?", [
        req.username,
        req.token,
      ]);
      res.json({ ok: true });
    });
    app.post("/api/security/mfa/disable", async (req, res) => {
      if (
        !(await verifyPassword(req.username, req.body.proof)) ||
        !(await verifyMfa(req.username, req.body.code))
      )
        return res
          .status(401)
          .json({ error: "Incorrect password or authenticator code" });
      await run(
        "UPDATE security SET secret=NULL,lastCounter=-1 WHERE username=?",
        [req.username],
      );
      res.json({ ok: true });
    });
    app.post("/api/security/recovery", async (req, res) => {
      const { proof, recoveryProof, envelope, code } = req.body;
      if (
        !(await verifyPassword(req.username, proof)) ||
        !(await verifyMfa(req.username, code))
      )
        return res
          .status(401)
          .json({ error: "Incorrect password or authenticator code" });
      if (!/^[a-f0-9]{64}$/.test(recoveryProof || "") || !validVault(envelope))
        return res.status(400).json({ error: "Invalid recovery setup" });
      await run(
        "INSERT INTO security(username,recoveryHash,recoveryEnvelope) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET recoveryHash=excluded.recoveryHash,recoveryEnvelope=excluded.recoveryEnvelope",
        [req.username, hash(recoveryProof), JSON.stringify(envelope)],
      );
      res.json({ ok: true });
    });
    app.post("/api/security/password", async (req, res) => {
      const { proof, newProof, vault, revision, code } = req.body;
      if (
        !(await verifyPassword(req.username, proof)) ||
        !(await verifyMfa(req.username, code))
      )
        return res
          .status(401)
          .json({ error: "Incorrect password or authenticator code" });
      if (
        !validVault(vault) ||
        !Number.isSafeInteger(revision) ||
        !/^[a-f0-9]{64}$/.test(newProof || "")
      )
        return res.status(400).json({ error: "Invalid password change" });
      const salt = crypto.randomBytes(16).toString("hex"),
        password = (await scrypt(newProof, salt, 64)).toString("hex");
      const changed = await run(
        "UPDATE users SET password=?,salt=?,vault=?,revision=revision+1 WHERE username=? AND revision=?",
        [password, salt, JSON.stringify(vault), req.username, revision],
      );
      if (!changed.changes)
        return res.status(409).json({
          error: "Sync and resolve conflicts before changing password",
        });
      await run(
        "UPDATE security SET recoveryHash=NULL,recoveryEnvelope=NULL WHERE username=?",
        [req.username],
      );
      await run("DELETE FROM sessions WHERE username=?", [req.username]);
      res.clearCookie("session", { path: "/api" });
      res.json({ revision: revision + 1 });
    });
    app.get("/api/shared", async (req, res) =>
      res.json(
        await all(
          "SELECT s.id,s.name,s.owner,s.revision,m.role FROM shared s JOIN members m ON m.book=s.id WHERE m.username=?",
          [req.username],
        ),
      ),
    );
    app.post("/api/shared", async (req, res) => {
      if (
        !validVault(req.body.vault) ||
        typeof req.body.name !== "string" ||
        !req.body.name.trim() ||
        req.body.name.length > 50
      )
        return res.status(400).json({ error: "Invalid shared book" });
      const id = crypto.randomUUID();
      await run("INSERT INTO shared(id,owner,name,vault) VALUES(?,?,?,?)", [
        id,
        req.username,
        req.body.name,
        JSON.stringify(req.body.vault),
      ]);
      await run("INSERT INTO members(book,username,role) VALUES(?,?,?)", [
        id,
        req.username,
        "owner",
      ]);
      res.json({ id, revision: 0 });
    });
    app.use("/api/shared/:id", async (req, res, next) => {
      const membership = await get(
        "SELECT role FROM members WHERE book=? AND username=?",
        [req.params.id, req.username],
      );
      if (!membership)
        return res
          .status(403)
          .json({ error: "No access to this shared cashbook" });
      req.sharedRole = membership.role;
      next();
    });
    app.get("/api/shared/:id", async (req, res) => {
      const s = await get("SELECT * FROM shared WHERE id=?", [req.params.id]);
      res.json({
        ...s,
        vault: JSON.parse(s.vault),
        role: req.sharedRole,
        members: await all("SELECT username,role FROM members WHERE book=?", [
          s.id,
        ]),
      });
    });
    app.put("/api/shared/:id", async (req, res) => {
      if (req.sharedRole === "viewer")
        return res.status(403).json({ error: "Viewers cannot edit" });
      if (
        !validVault(req.body.vault) ||
        !Number.isSafeInteger(req.body.revision)
      )
        return res.status(400).json({ error: "Invalid shared vault" });
      const r = await run(
        "UPDATE shared SET vault=?,revision=revision+1 WHERE id=? AND revision=?",
        [JSON.stringify(req.body.vault), req.params.id, req.body.revision],
      );
      if (!r.changes)
        return res.status(409).json({
          error: "Shared cashbook changed. Reload it before editing.",
        });
      res.json({ revision: req.body.revision + 1 });
    });
    app.put("/api/shared/:id/members", async (req, res) => {
      if (req.sharedRole !== "owner")
        return res
          .status(403)
          .json({ error: "Only the owner can manage members" });
      const { username, role } = req.body;
      if (
        username === req.username ||
        !["viewer", "editor", "remove"].includes(role)
      )
        return res.status(400).json({ error: "Invalid member change" });
      if (
        !(await get("SELECT username FROM users WHERE username=?", [username]))
      )
        return res.status(404).json({ error: "Username not found" });
      if (role === "remove")
        await run("DELETE FROM members WHERE book=? AND username=?", [
          req.params.id,
          username,
        ]);
      else
        await run(
          "INSERT INTO members(book,username,role) VALUES(?,?,?) ON CONFLICT(book,username) DO UPDATE SET role=excluded.role",
          [req.params.id, username, role],
        );
      res.json({ ok: true });
    });
  }
  return { init, verifyMfa, publicRoutes, privateRoutes };
};
