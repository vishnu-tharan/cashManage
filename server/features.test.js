const test = require("node:test"),
  assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
process.env.PORT = "0";
const { start } = require("./index"),
  db = require("./db"),
  { encode, totp } = require("./totp");
test("TOTP agrees with RFC 6238 SHA-1 vectors (six digit truncation)", () => {
  const secret = encode(Buffer.from("12345678901234567890"));
  assert.equal(totp(secret, Math.floor(59 / 30)), "287082");
  assert.equal(totp(secret, Math.floor(1111111109 / 30)), "081804");
});
test("MFA, recovery, password rotation and shared cashbook role enforcement", async () => {
  const server = await start(),
    root = `http://localhost:${server.address().port}/api`;
  const req = (url, method = "GET", body, cookie = "") =>
    fetch(root + url, {
      method,
      headers: {
        Origin: "http://localhost:5173",
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
  const register = async (username, proof) => {
    const r = await req("/auth/register", "POST", { username, proof, vault });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").split(";")[0];
  };
  try {
    const alice = await register("alice", "a".repeat(64)),
      bob = await register("bob", "b".repeat(64));
    assert.equal(
      (
        await req(
          "/security/recovery",
          "POST",
          {
            proof: "a".repeat(64),
            recoveryProof: "d".repeat(64),
            envelope: vault,
          },
          alice,
        )
      ).status,
      200,
    );
    const setup = await (
        await req(
          "/security/mfa/setup",
          "POST",
          { proof: "a".repeat(64) },
          alice,
        )
      ).json(),
      step = Math.floor(Date.now() / 30000);
    assert.equal(
      (
        await req(
          "/security/mfa/enable",
          "POST",
          { code: totp(setup.secret, step) },
          alice,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/auth/login", "POST", {
          username: "alice",
          proof: "a".repeat(64),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await req("/auth/login", "POST", {
          username: "alice",
          proof: "a".repeat(64),
          otp: totp(setup.secret, step),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await req("/auth/login", "POST", {
          username: "alice",
          proof: "a".repeat(64),
          otp: totp(setup.secret, step + 1),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/auth/recovery", "POST", {
          username: "alice",
          recoveryProof: "e".repeat(64),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await req("/auth/recovery", "POST", {
          username: "alice",
          recoveryProof: "d".repeat(64),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/auth/recovery", "POST", {
          username: "alice",
          recoveryProof: "d".repeat(64),
          newProof: "f".repeat(64),
          vault,
          revision: 0,
        })
      ).status,
      200,
    );
    assert.equal((await req("/vault", "GET", null, alice)).status, 401);
    assert.equal(
      (
        await req("/auth/recovery", "POST", {
          username: "alice",
          recoveryProof: "d".repeat(64),
        })
      ).status,
      401,
    );
    const login = await req("/auth/login", "POST", {
      username: "alice",
      proof: "f".repeat(64),
    });
    assert.equal(login.status, 200);
    const ac = login.headers.get("set-cookie").split(";")[0];
    const shared = await (
        await req("/shared", "POST", { name: "Family", vault }, bob)
      ).json(),
      url = `/shared/${shared.id}`;
    assert.equal((await req(url, "GET", null, ac)).status, 403);
    assert.equal(
      (
        await req(
          url + "/members",
          "PUT",
          { username: "alice", role: "viewer" },
          bob,
        )
      ).status,
      200,
    );
    assert.equal((await req(url, "GET", null, ac)).status, 200);
    assert.equal(
      (await req(url, "PUT", { vault, revision: 0 }, ac)).status,
      403,
    );
    assert.equal(
      (
        await req(
          url + "/members",
          "PUT",
          { username: "bob", role: "remove" },
          ac,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          url + "/members",
          "PUT",
          { username: "alice", role: "editor" },
          bob,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req(url, "PUT", { vault, revision: 0 }, ac)).status,
      200,
    );
    assert.equal(
      (await req(url, "PUT", { vault, revision: 0 }, bob)).status,
      409,
    );
    assert.equal(
      (
        await req(
          url + "/members",
          "PUT",
          { username: "alice", role: "remove" },
          bob,
        )
      ).status,
      200,
    );
    assert.equal((await req(url, "GET", null, ac)).status, 403);
    assert.equal(
      (
        await req(
          "/security/password",
          "POST",
          {
            proof: "b".repeat(64),
            newProof: "c".repeat(64),
            vault,
            revision: 0,
          },
          bob,
        )
      ).status,
      200,
    );
    assert.equal((await req("/vault", "GET", null, bob)).status, 401);
    assert.equal(
      (
        await req("/auth/login", "POST", {
          username: "bob",
          proof: "c".repeat(64),
        })
      ).status,
      200,
    );
  } finally {
    await new Promise((r) => server.close(r));
    await new Promise((r) => db.close(r));
  }
});
