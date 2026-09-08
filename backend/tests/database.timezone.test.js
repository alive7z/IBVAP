const test = require("node:test");
const assert = require("node:assert/strict");
const { getPool, closeDatabasePool } = require("../src/config/database");

test("every MySQL connection uses UTC for defaults and lifecycle timestamps", async () => {
  const [[row]] = await getPool().query(
    "SELECT @@session.time_zone AS sessionTimeZone, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offsetSeconds"
  );
  assert.strictEqual(row.sessionTimeZone, "+00:00");
  assert.strictEqual(Number(row.offsetSeconds), 0);
});

test.after(async () => {
  await closeDatabasePool();
});
