const { test } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const {
  generateAccessToken,
  verifyAccessToken,
} = require("../src/utils/jwt");

const TEST_SECRET = "test-only-jsonwebtoken-secret-0123456789abcdef";

test("valid token verifies and returns payload", () => {
  const payload = { sub: "abc-123", userId: 7, role: "ADMINISTRATOR" };
  const token = generateAccessToken(payload, { secret: TEST_SECRET });
  const decoded = verifyAccessToken(token, { secret: TEST_SECRET });
  assert.strictEqual(decoded.sub, "abc-123");
  assert.strictEqual(decoded.userId, 7);
  assert.strictEqual(decoded.role, "ADMINISTRATOR");
});

test("modified token fails verification", () => {
  const payload = { sub: "abc-123", userId: 7, role: "ADMINISTRATOR" };
  const token = generateAccessToken(payload, { secret: TEST_SECRET });
  const tampered = `${token.slice(0, -4)}AAAA`;
  assert.throws(() => verifyAccessToken(tampered, { secret: TEST_SECRET }));
});

test("expired token fails verification", () => {
  const payload = { sub: "abc-123", userId: 7, role: "ADMINISTRATOR" };
  const token = jwt.sign(payload, TEST_SECRET, { expiresIn: "-10s" });
  assert.throws(() => verifyAccessToken(token, { secret: TEST_SECRET }));
});
