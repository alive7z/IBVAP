const { test, afterEach } = require("node:test");
const assert = require("node:assert");

const {
  loiteringDurationTiers,
  DEFAULT_LOITERING_DURATION_TIERS,
} = require("../src/services/riskConfig.service");

const original = process.env.RISK_LOITERING_DURATION_TIERS;

afterEach(() => {
  if (original === undefined) delete process.env.RISK_LOITERING_DURATION_TIERS;
  else process.env.RISK_LOITERING_DURATION_TIERS = original;
});

test("default loitering tiers implement the production progression", () => {
  delete process.env.RISK_LOITERING_DURATION_TIERS;
  assert.deepStrictEqual(loiteringDurationTiers(), [
    { minimumDurationSeconds: 10, score: 15 },
    { minimumDurationSeconds: 20, score: 25 },
    { minimumDurationSeconds: 30, score: 40 },
    { minimumDurationSeconds: 45, score: 50 },
    { minimumDurationSeconds: 60, score: 65 },
    { minimumDurationSeconds: 120, score: 80, exclusive: true },
  ]);
});

test("valid loitering tiers can be configured in one environment value", () => {
  process.env.RISK_LOITERING_DURATION_TIERS = JSON.stringify([
    { minimumDurationSeconds: 5, score: 12 },
    { minimumDurationSeconds: 30, score: 70 },
  ]);
  assert.deepStrictEqual(loiteringDurationTiers(), [
    { minimumDurationSeconds: 5, score: 12 },
    { minimumDurationSeconds: 30, score: 70 },
  ]);
});

test("invalid tier configuration safely falls back to defaults", () => {
  process.env.RISK_LOITERING_DURATION_TIERS = "not-json";
  assert.deepStrictEqual(loiteringDurationTiers(), DEFAULT_LOITERING_DURATION_TIERS);
});
