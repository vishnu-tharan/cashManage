import test from "node:test";
import assert from "node:assert/strict";
import {
  derive,
  seal,
  unseal,
  randomSalt,
  initial,
  digits,
  proof,
} from "./src/storage.js";
test("Encrypted backup roundtrip, wrong password and tamper rejection", async () => {
  const salt = randomSalt(),
    key = await derive("a-long-test-password", salt),
    data = initial("Test");
  const vault = await seal(data, key, salt);
  assert.ok(!JSON.stringify(vault).includes("Personal wallet"));
  assert.deepEqual(await unseal(vault, key), data);
  await assert.rejects(unseal(vault, await derive("incorrect-password", salt)));
  await assert.rejects(
    unseal(
      {
        ...vault,
        cipher: (vault.cipher[0] === "a" ? "b" : "a") + vault.cipher.slice(1),
      },
      key,
    ),
  );
  assert.notEqual(
    await proof("alice", "password"),
    await proof("bob", "password"),
  );
  assert.equal(digits("JPY"), 0);
  assert.equal(digits("LKR"), 2);
});
