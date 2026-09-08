const { test } = require("node:test");
const assert = require("node:assert");

const {
  indiaDayRange,
  parseIntelligenceDateRange,
} = require("../src/utils/datetime");

test("India day boundaries are converted to exclusive UTC boundaries", () => {
  const range = indiaDayRange(new Date("2026-09-07T11:00:00.000Z"));
  assert.deepStrictEqual(range, {
    startDate: "2026-09-06 18:30:00",
    endDate: "2026-09-07 18:30:00",
  });
});

test("an India midnight boundary belongs to the correct day", () => {
  const beforeMidnight = indiaDayRange(new Date("2026-09-06T18:29:59.999Z"));
  const atMidnight = indiaDayRange(new Date("2026-09-06T18:30:00.000Z"));
  assert.strictEqual(beforeMidnight.startDate, "2026-09-05 18:30:00");
  assert.strictEqual(atMidnight.startDate, "2026-09-06 18:30:00");
});

test("custom date-only filters are interpreted in Asia/Kolkata and end is inclusive by day", () => {
  assert.deepStrictEqual(
    parseIntelligenceDateRange({ startDate: "2026-09-01", endDate: "2026-09-07" }),
    { startDate: "2026-08-31 18:30:00", endDate: "2026-09-07 18:30:00" }
  );
});

