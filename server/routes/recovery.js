module.exports = function recovery({
  app,
  get,
  crypto,
  hash,
  validVault,
  scrypt,
  run
}) {
  app.post("/api/auth/recovery", async (req, res) => {
    const {
      username,
      recoveryProof,
      newProof,
      vault,
      revision
    } = req.body;
    if (!/^[a-f0-9]{64}$/.test(recoveryProof || "")) return res.status(400).json({
      error: "Invalid recovery key"
    });
    const row = await get("SELECT * FROM security WHERE username=?", [username]);
    if (!row?.recoveryHash || !crypto.timingSafeEqual(Buffer.from(hash(recoveryProof), "hex"), Buffer.from(row.recoveryHash, "hex"))) return res.status(401).json({
      error: "Invalid recovery credentials"
    });
    const user = await get("SELECT * FROM users WHERE username=?", [username]);
    if (!newProof) return res.json({
      vault: JSON.parse(user.vault),
      envelope: JSON.parse(row.recoveryEnvelope),
      revision: user.revision
    });
    if (!/^[a-f0-9]{64}$/.test(newProof) || !validVault(vault) || revision !== user.revision) return res.status(409).json({
      error: "Invalid reset or account changed; retry recovery"
    });
    const salt = crypto.randomBytes(16).toString("hex"),
      password = (await scrypt(newProof, salt, 64)).toString("hex");
    const changed = await run("UPDATE users SET password=?,salt=?,vault=?,revision=revision+1 WHERE username=? AND revision=?", [password, salt, JSON.stringify(vault), username, revision]);
    if (!changed.changes) return res.status(409).json({
      error: "Account changed; retry recovery"
    });
    await run("DELETE FROM security WHERE username=?", [username]);
    await run("DELETE FROM sessions WHERE username=?", [username]);
    res.json({
      ok: true
    });
  });
};
