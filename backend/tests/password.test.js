const { test } = require("node:test");
const assert = require("node:assert");
const {
  hashPassword,
  comparePassword,
} = require("../src/utils/password");

test("hashPassword produces a hash different from plaintext", async () => {
  const hash = await hashPassword("SuperSecret#123");
  assert.notStrictEqual(hash, "SuperSecret#123");
  assert.match(hash, /^\$2[aby]\$\d+\$/);
});

test("correct password compares to true", async () => {
  const hash = await hashPassword("SuperSecret#123");
  const ok = await comparePassword("SuperSecret#123", hash);
  assert.strictEqual(ok, true);
});

test("wrong password compares to false", async () => {
  const hash = await hashPassword("SuperSecret#123");
  const ok = await comparePassword("WrongPassword#999", hash);
  assert.strictEqual(ok, false);
});
