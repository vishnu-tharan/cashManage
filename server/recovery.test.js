const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
process.env.DB_PATH = ":memory:";
process.env.PORT = "0";
const { start } = require("./index"),
  db = require("./db");
test("Real encrypted recovery retrieves the latest synced data and rotates encryption keys", async () => {
  const { derive, seal, unseal, proof, randomSalt, initial } =
    await import("../client/src/storage.js");
  const server = await start(),
    root = `http://localhost:${server.address().port}/api`;
  const request = async (url, body, cookie = "") => {
    const r = await fetch(root + url, {
      method: url === "/vault" ? "PUT" : "POST",
      headers: {
        Origin: "http://localhost:5173",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, await r.clone().text());
    return {
      json: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    const username = "crypto_test",
      password = "temporary-test-passphrase",
      salt = randomSalt(),
      key = await derive(password, salt),
      data = initial("Crypto test"),
      p = await proof(username, password);
    const account = await request("/auth/register", {
      username,
      proof: p,
      vault: await seal(data, key, salt),
    });
    const recoveryKey = crypto.randomBytes(32).toString("hex"),
      recoveryProof = crypto
        .createHash("sha256")
        .update(recoveryKey)
        .digest("hex"),
      rs = randomSalt();
    const raw = Buffer.from(
      await globalThis.crypto.subtle.exportKey("raw", key),
    ).toString("hex");
    const envelope = await seal(
      { raw, salt },
      await derive(recoveryKey, rs),
      rs,
    );
    await request(
      "/security/recovery",
      { proof: p, recoveryProof, envelope },
      account.cookie,
    );
    data.transactions.push({
      id: "latest",
      book: data.books[0].id,
      amount: 12345,
      date: "2026-09-12",
      type: "income",
      note: "Latest synced entry",
      category: "Other",
    });
    await request(
      "/vault",
      { revision: 0, vault: await seal(data, key, salt) },
      account.cookie,
    );
    const response = (
      await request("/auth/recovery", { username, recoveryProof })
    ).json;
    const recoveryAES = await derive(recoveryKey, response.envelope.salt);
    const wrapped = JSON.parse(
      new TextDecoder().decode(
        await globalThis.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: Buffer.from(response.envelope.iv, "hex") },
          recoveryAES,
          Buffer.from(response.envelope.cipher, "hex"),
        ),
      ),
    );
    const recoveredKey = await globalThis.crypto.subtle.importKey(
      "raw",
      Buffer.from(wrapped.raw, "hex"),
      "AES-GCM",
      true,
      ["encrypt", "decrypt"],
    );
    assert.deepEqual(await unseal(response.vault, recoveredKey), data);
    const newSalt = randomSalt(),
      newKey = await derive("new-test-passphrase", newSalt),
      newProof = await proof(username, "new-test-passphrase"),
      newVault = await seal(data, newKey, newSalt);
    await request("/auth/recovery", {
      username,
      recoveryProof,
      newProof,
      vault: newVault,
      revision: response.revision,
    });
    const login = (await request("/auth/login", { username, proof: newProof }))
      .json;
    assert.deepEqual(await unseal(login.vault, newKey), data);
    await assert.rejects(unseal(login.vault, key));
  } finally {
    await new Promise((r) => server.close(r));
    await new Promise((r) => db.close(r));
  }
});
