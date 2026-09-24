module.exports = function sharedBooks({
  app,
  all,
  validVault,
  crypto,
  run,
  get
}) {
  app.get("/api/shared", async (req, res) => res.json(await all("SELECT s.id,s.name,s.owner,s.revision,m.role FROM shared s JOIN members m ON m.book=s.id WHERE m.username=?", [req.username])));
  app.post("/api/shared", async (req, res) => {
    if (!validVault(req.body.vault) || typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.length > 50) return res.status(400).json({
      error: "Invalid shared book"
    });
    const id = crypto.randomUUID();
    await run("INSERT INTO shared(id,owner,name,vault) VALUES(?,?,?,?)", [id, req.username, req.body.name, JSON.stringify(req.body.vault)]);
    await run("INSERT INTO members(book,username,role) VALUES(?,?,?)", [id, req.username, "owner"]);
    res.json({
      id,
      revision: 0
    });
  });
  app.use("/api/shared/:id", async (req, res, next) => {
    const membership = await get("SELECT role FROM members WHERE book=? AND username=?", [req.params.id, req.username]);
    if (!membership) return res.status(403).json({
      error: "No access to this shared cashbook"
    });
    req.sharedRole = membership.role;
    next();
  });
  app.get("/api/shared/:id", async (req, res) => {
    const s = await get("SELECT * FROM shared WHERE id=?", [req.params.id]);
    res.json({
      ...s,
      vault: JSON.parse(s.vault),
      role: req.sharedRole,
      members: await all("SELECT username,role FROM members WHERE book=?", [s.id])
    });
  });
  app.put("/api/shared/:id", async (req, res) => {
    if (req.sharedRole === "viewer") return res.status(403).json({
      error: "Viewers cannot edit"
    });
    if (!validVault(req.body.vault) || !Number.isSafeInteger(req.body.revision)) return res.status(400).json({
      error: "Invalid shared vault"
    });
    const r = await run("UPDATE shared SET vault=?,revision=revision+1 WHERE id=? AND revision=?", [JSON.stringify(req.body.vault), req.params.id, req.body.revision]);
    if (!r.changes) return res.status(409).json({
      error: "Shared cashbook changed. Reload it before editing."
    });
    res.json({
      revision: req.body.revision + 1
    });
  });
  app.put("/api/shared/:id/members", async (req, res) => {
    if (req.sharedRole !== "owner") return res.status(403).json({
      error: "Only the owner can manage members"
    });
    const {
      username,
      role
    } = req.body;
    if (username === req.username || !["viewer", "editor", "remove"].includes(role)) return res.status(400).json({
      error: "Invalid member change"
    });
    if (!(await get("SELECT username FROM users WHERE username=?", [username]))) return res.status(404).json({
      error: "Username not found"
    });
    if (role === "remove") await run("DELETE FROM members WHERE book=? AND username=?", [req.params.id, username]);else await run("INSERT INTO members(book,username,role) VALUES(?,?,?) ON CONFLICT(book,username) DO UPDATE SET role=excluded.role", [req.params.id, username, role]);
    res.json({
      ok: true
    });
  });
};
