const test = require("node:test");
const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
process.env.PORT = "0";
const { start } = require("./index");
const db = require("./db");
test("Private account API: authentication, isolation, validation, conflicts and revocation", async () => {
  const server = await start();
  const root = `http://localhost:${server.address().port}/api`;
  const request = (
    url,
    method = "GET",
    body,
    cookie = "",
    origin = "http://localhost:5173",
  ) =>
    fetch(root + url, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body && JSON.stringify(body),
    });
  const vault = {
    version: 1,
    salt: "a".repeat(32),
    iv: "b".repeat(24),
    cipher: "c".repeat(64),
  };
  try {
    assert.equal((await request("/vault")).status, 401);
    assert.equal(
      (
        await request(
          "/auth/register",
          "POST",
          { username: "alice", proof: "a".repeat(64), vault },
          "",
          "https://attacker.example",
        )
      ).status,
      403,
    );
    const a = await request("/auth/register", "POST", {
      username: "alice",
      proof: "a".repeat(64),
      vault,
    });
    assert.equal(a.status, 200);
    const cookie = a.headers.get("set-cookie").split(";")[0];
    assert.match(a.headers.get("set-cookie"), /HttpOnly/);
    assert.match(a.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal(
      (
        await request("/auth/register", "POST", {
          username: "alice",
          proof: "a".repeat(64),
          vault,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("/auth/login", "POST", {
          username: "alice",
          proof: "b".repeat(64),
        })
      ).status,
      401,
    );
    const b = await request("/auth/register", "POST", {
      username: "bob",
      proof: "b".repeat(64),
      vault: { ...vault, cipher: "d".repeat(64) },
    });
    const bob = b.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await (await request("/vault", "GET", null, cookie)).json()).vault
        .cipher,
      vault.cipher,
    );
    assert.equal(
      (await (await request("/vault", "GET", null, bob)).json()).vault.cipher,
      "d".repeat(64),
    );
    assert.equal(
      (await request("/vault", "PUT", { vault: {}, revision: 0 }, cookie))
        .status,
      400,
    );
    assert.equal(
      (await request("/vault", "PUT", { vault, revision: 0 }, cookie)).status,
      200,
    );
    assert.equal(
      (await request("/vault", "PUT", { vault, revision: 0 }, cookie)).status,
      409,
    );
    assert.equal(
      (await request("/transactions", "GET", null, cookie)).status,
      404,
    );
    assert.equal(
      (await request("/sessions", "DELETE", null, cookie)).status,
      200,
    );
    assert.equal((await request("/vault", "GET", null, cookie)).status, 401);
    assert.equal((await request("/vault", "GET", null, bob)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => db.close(resolve));
  }
});
