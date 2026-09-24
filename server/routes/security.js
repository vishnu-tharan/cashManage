module.exports = function security({
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
}) {
  app.get("/api/security", async (req, res) => {
    const s = await get("SELECT * FROM security WHERE username=?", [req.username]);
    res.json({
      mfa: !!s?.secret,
      recovery: !!s?.recoveryHash
    });
  });
  app.post("/api/security/mfa/setup", async (req, res) => {
    if (!(await verifyPassword(req.username, req.body.proof))) return res.status(401).json({
      error: "Incorrect password"
    });
    const s = await get("SELECT * FROM security WHERE username=?", [req.username]);
    if (s?.secret) return res.status(409).json({
      error: "MFA is already enabled"
    });
    const secret = encode(crypto.randomBytes(20));
    await run("INSERT INTO security(username,pending) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET pending=excluded.pending", [req.username, encrypt(secret)]);
    res.json({
      secret,
      uri: `otpauth://totp/CashManage:${req.username}?secret=${secret}&issuer=CashManage&algorithm=SHA1&digits=6&period=30`
    });
  });
  app.post("/api/security/mfa/enable", async (req, res) => {
    const s = await get("SELECT * FROM security WHERE username=?", [req.username]);
    const counter = Math.floor(Date.now() / 30000);
    if (!s?.pending || totp(decrypt(s.pending), counter) !== req.body.code) return res.status(400).json({
      error: "Invalid authenticator code"
    });
    await run("UPDATE security SET secret=pending,pending=NULL,lastCounter=? WHERE username=?", [counter, req.username]);
    await run("DELETE FROM sessions WHERE username=? AND token<>?", [req.username, req.token]);
    res.json({
      ok: true
    });
  });
  app.post("/api/security/mfa/disable", async (req, res) => {
    if (!(await verifyPassword(req.username, req.body.proof)) || !(await verifyMfa(req.username, req.body.code))) return res.status(401).json({
      error: "Incorrect password or authenticator code"
    });
    await run("UPDATE security SET secret=NULL,lastCounter=-1 WHERE username=?", [req.username]);
    res.json({
      ok: true
    });
  });
  app.post("/api/security/recovery", async (req, res) => {
    const {
      proof,
      recoveryProof,
      envelope,
      code
    } = req.body;
    if (!(await verifyPassword(req.username, proof)) || !(await verifyMfa(req.username, code))) return res.status(401).json({
      error: "Incorrect password or authenticator code"
    });
    if (!/^[a-f0-9]{64}$/.test(recoveryProof || "") || !validVault(envelope)) return res.status(400).json({
      error: "Invalid recovery setup"
    });
    await run("INSERT INTO security(username,recoveryHash,recoveryEnvelope) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET recoveryHash=excluded.recoveryHash,recoveryEnvelope=excluded.recoveryEnvelope", [req.username, hash(recoveryProof), JSON.stringify(envelope)]);
    res.json({
      ok: true
    });
  });
  app.post("/api/security/password", async (req, res) => {
    const {
      proof,
      newProof,
      vault,
      revision,
      code
    } = req.body;
    if (!(await verifyPassword(req.username, proof)) || !(await verifyMfa(req.username, code))) return res.status(401).json({
      error: "Incorrect password or authenticator code"
    });
    if (!validVault(vault) || !Number.isSafeInteger(revision) || !/^[a-f0-9]{64}$/.test(newProof || "")) return res.status(400).json({
      error: "Invalid password change"
    });
    const salt = crypto.randomBytes(16).toString("hex"),
      password = (await scrypt(newProof, salt, 64)).toString("hex");
    const changed = await run("UPDATE users SET password=?,salt=?,vault=?,revision=revision+1 WHERE username=? AND revision=?", [password, salt, JSON.stringify(vault), req.username, revision]);
    if (!changed.changes) return res.status(409).json({
      error: "Sync and resolve conflicts before changing password"
    });
    await run("UPDATE security SET recoveryHash=NULL,recoveryEnvelope=NULL WHERE username=?", [req.username]);
    await run("DELETE FROM sessions WHERE username=?", [req.username]);
    res.clearCookie("session", {
      path: "/api"
    });
    res.json({
      revision: revision + 1
    });
  });
};
