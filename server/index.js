require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const path = require("node:path");
const db = require("./db");
const scrypt = promisify(crypto.scrypt);
const run = (sql, args = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, args, function (e) {
      e ? reject(e) : resolve(this);
    }),
  );
const get = (sql, args = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, args, (e, row) => (e ? reject(e) : resolve(row))),
  );
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.frankfurter.dev https://www.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  });
  if (process.env.NODE_ENV === "production")
    res.set("Strict-Transport-Security", "max-age=31536000");
  if (req.path.startsWith("/api")) {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.get("Origin") !== (process.env.APP_ORIGIN || "http://localhost:5173")
    )
      return res.status(403).json({ error: "Invalid request origin" });
  }
  next();
});
app.use(express.json({ limit: "5mb" }));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const attempts = new Map();
setInterval(() => {
  for (const [key, value] of attempts)
    if (value.until < Date.now()) attempts.delete(key);
}, 60000).unref();
app.use(["/api/auth", "/api/security"], (req, res, next) => {
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: Date.now() + 900000 };
  if (entry.until < Date.now()) {
    entry.count = 0;
    entry.until = Date.now() + 900000;
  }
  attempts.set(key, entry);
  if (++entry.count > 30)
    return res
      .status(429)
      .json({ error: "Too many attempts. Try again in 15 minutes." });
  next();
});
const validVault = (v) =>
  v &&
  v.version === 1 &&
  /^[a-f0-9]{32}$/.test(v.salt || "") &&
  /^[a-f0-9]{24}$/.test(v.iv || "") &&
  typeof v.cipher === "string" &&
  /^[a-f0-9]+$/.test(v.cipher) &&
  v.cipher.length <= 9000000;
const all = (sql, args = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, args, (e, rows) => (e ? reject(e) : resolve(rows))),
  );
const features = require("./features")({
  app,
  run,
  get,
  all,
  scrypt,
  validVault,
  hash,
});
features.publicRoutes();
app.post("/api/auth/:action", async (req, res) => {
  const { username, proof, vault } = req.body;
  if (
    !/^[a-z0-9_]{3,24}$/.test(username || "") ||
    !/^[a-f0-9]{64}$/.test(proof || "")
  )
    return res.status(400).json({ error: "Invalid credentials format" });
  let user = await get("SELECT * FROM users WHERE username = ?", [username]);
  if (req.params.action === "register") {
    if (!validVault(vault))
      return res.status(400).json({ error: "Invalid encrypted vault" });
    if (user)
      return res.status(409).json({ error: "Username is already taken" });
    const salt = crypto.randomBytes(16).toString("hex");
    const password = (await scrypt(proof, salt, 64)).toString("hex");
    try {
      await run(
        "INSERT INTO users(username,password,salt,vault,revision) VALUES(?,?,?,?,0)",
        [username, password, salt, JSON.stringify(vault)],
      );
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT")
        return res.status(409).json({ error: "Username is already taken" });
      throw e;
    }
    user = await get("SELECT * FROM users WHERE username = ?", [username]);
  } else if (req.params.action === "login") {
    const candidate = await scrypt(proof, user?.salt || "dummy-salt", 64);
    if (
      !user ||
      !crypto.timingSafeEqual(candidate, Buffer.from(user.password, "hex"))
    )
      return res.status(401).json({ error: "Incorrect username or password" });
    if (!(await features.verifyMfa(username, req.body.otp)))
      return res.status(401).json({
        error:
          "Authenticator code required or invalid (wait for a fresh code if already used)",
      });
  } else return res.sendStatus(404);
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO sessions(token,username,expires) VALUES(?,?,?)", [
    hash(token),
    username,
    Date.now() + 86400000,
  ]);
  res.cookie("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 86400000,
    path: "/api",
  });
  res.json({ vault: JSON.parse(user.vault), revision: user.revision });
});
app.use("/api", async (req, res, next) => {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="))
    ?.slice(8);
  if (!token)
    return res
      .status(401)
      .json({ error: "Sign in online to reconnect your session" });
  const session =
    await get("SELECT * FROM sessions WHERE token=? AND expires>?", [
      hash(token),
      Date.now(),
    ]);
  if (!session)
    return res
      .status(401)
      .json({ error: "Sign in online to reconnect your session" });
  req.username = session.username;
  req.token = session.token;
  next();
});
features.privateRoutes();
app.get("/api/vault", async (req, res) => {
  const u = await get("SELECT vault,revision FROM users WHERE username=?", [
    req.username,
  ]);
  res.json({ vault: JSON.parse(u.vault), revision: u.revision });
});
app.put("/api/vault", async (req, res) => {
  if (!validVault(req.body.vault) || !Number.isSafeInteger(req.body.revision))
    return res.status(400).json({ error: "Invalid vault" });
  const result = await run(
    "UPDATE users SET vault=?,revision=revision+1 WHERE username=? AND revision=?",
    [JSON.stringify(req.body.vault), req.username, req.body.revision],
  );
  if (!result.changes)
    return res.status(409).json({
      error:
        "Another device changed this account. Export a backup before loading the cloud version.",
    });
  res.json({ revision: req.body.revision + 1 });
});
app.get("/api/sessions", async (req, res) => {
  db.all(
    "SELECT token,expires FROM sessions WHERE username=? AND expires>?",
    [req.username, Date.now()],
    (e, rows) =>
      e
        ? res.sendStatus(500)
        : res.json(
            rows.map((r) => ({
              id: r.token,
              expires: r.expires,
              current: r.token === req.token,
            })),
          ),
  );
});
app.delete("/api/sessions", async (req, res) => {
  await run("DELETE FROM sessions WHERE username=?", [req.username]);
  res.clearCookie("session", { path: "/api" });
  res.json({ ok: true });
});
app.post("/api/logout", async (req, res) => {
  await run("DELETE FROM sessions WHERE token=?", [req.token]);
  res.clearCookie("session", { path: "/api" });
  res.json({ ok: true });
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
app.use(express.static(path.resolve(__dirname, "../client/dist")));
app.get("/{*path}", (req, res) =>
  res.sendFile(path.resolve(__dirname, "../client/dist/index.html")),
);
app.use((err, req, res, next) => {
  console.error(err.message);
  res
    .status(err.status || 500)
    .json({ error: "Request could not be completed" });
});
async function start() {
  await run(
    "CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,password TEXT NOT NULL,salt TEXT NOT NULL,vault TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)",
  );
  await run(
    "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,username TEXT NOT NULL,expires INTEGER NOT NULL)",
  );
  await run("DELETE FROM sessions WHERE expires<?", [Date.now()]);
  await features.init();
  return app.listen(process.env.PORT || 3000, () =>
    console.log("CashManage server ready"),
  );
}
if (require.main === module) start().catch(console.error);
module.exports = { app, start };
