const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");

const TEST_SECRET = "test-only-auth-integration-secret-9fedcba876543210";

const EMAIL = "auth.test.user@ibvap.local";
const PASSWORD = "AuthTest#Password2026!";
const DISABLED_EMAIL = "auth.test.disabled@ibvap.local";
const DISABLED_PASSWORD = "AuthDisabled#2026!";

let pool;
let testUserId;
let disabledUserId;

const createTestUser = async (email, password, role, status) => {
  const [result] = await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), "Auth Test User", email, await hashPassword(password), role, status]
  );
  return result.insertId;
};

const cleanupUser = async (id) => {
  if (id) {
    await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  }
};

before(async () => {
  pool = getPool();
  testUserId = await createTestUser(EMAIL, PASSWORD, "ADMINISTRATOR", "ACTIVE");
  disabledUserId = await createTestUser(DISABLED_EMAIL, DISABLED_PASSWORD, "SECURITY_OPERATOR", "INACTIVE");
});

after(async () => {
  await cleanupUser(testUserId);
  await cleanupUser(disabledUserId);
  await closeDatabasePool();
});

const loginResponse = async (email, password) => {
  return request(app)
    .post("/api/auth/login")
    .send({ email, password });
};

test("POST /api/auth/login valid credentials returns 200 and safe user", async () => {
  const res = await loginResponse(EMAIL, PASSWORD);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.message, "Login successful");
  assert.ok(res.body.data.accessToken);
  assert.strictEqual(res.body.data.tokenType, "Bearer");
  assert.strictEqual(res.body.data.user.email, EMAIL);
  assert.strictEqual(res.body.data.user.role, "ADMINISTRATOR");
  assert.ok(res.body.data.user.publicId);
  assert.strictEqual(res.body.data.user.password_hash, undefined);
  assert.strictEqual(res.body.data.user.id, undefined);
  assert.strictEqual(JSON.stringify(res.body).includes("password_hash"), false);
});

test("POST /api/auth/login unknown email returns 401", async () => {
  const res = await loginResponse("nobody@ibvap.local", PASSWORD);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, "Invalid email or password");
});

test("POST /api/auth/login incorrect password returns 401", async () => {
  const res = await loginResponse(EMAIL, "wrong-password-xyz");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, "Invalid email or password");
});

test("POST /api/auth/login inactive user returns 403", async () => {
  const res = await loginResponse(DISABLED_EMAIL, DISABLED_PASSWORD);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.message, "Account is not active");
});

test("POST /api/auth/login missing fields returns 400", async () => {
  const noEmail = await loginResponse("", PASSWORD);
  assert.strictEqual(noEmail.status, 400);
  const noPassword = await loginResponse(EMAIL, "");
  assert.strictEqual(noPassword.status, 400);
});

test("GET /api/auth/me without token returns 401", async () => {
  const res = await request(app).get("/api/auth/me");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, "Authentication required");
});

test("GET /api/auth/me with invalid token returns 401", async () => {
  const res = await request(app)
    .get("/api/auth/me")
    .set("Authorization", "Bearer not-a-real-token");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, "Invalid or expired token");
});

test("GET /api/auth/me with expired token returns 401", async () => {
  const token = jwt.sign({ sub: "x", userId: testUserId, role: "ADMINISTRATOR" }, TEST_SECRET, { expiresIn: "-1s" });
  const res = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.message, "Invalid or expired token");
});

test("GET /api/auth/me with valid token returns 200 and safe user", async () => {
  const login = await loginResponse(EMAIL, PASSWORD);
  const token = login.body.data.accessToken;
  const res = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.user.email, EMAIL);
  assert.strictEqual(res.body.data.user.role, "ADMINISTRATOR");
  assert.strictEqual(JSON.stringify(res.body).includes("password_hash"), false);
});

test("RBAC: allowed role is granted access", async () => {
  const login = await loginResponse(EMAIL, PASSWORD);
  const token = login.body.data.accessToken;

  const probe = await (async () => {
    const express = require("express");
    const { authenticate } = require("../src/middleware/auth.middleware");
    const { authorizeRoles } = require("../src/middleware/role.middleware");
    const testApp = express();
    testApp.get(
      "/probe",
      authenticate,
      authorizeRoles("ADMINISTRATOR"),
      (req, res) => res.status(200).json({ ok: true, role: req.user.role })
    );
    return request(testApp)
      .get("/probe")
      .set("Authorization", `Bearer ${token}`);
  })();

  assert.strictEqual(probe.status, 200);
  assert.strictEqual(probe.body.role, "ADMINISTRATOR");
});

test("RBAC: denied role returns 403", async () => {
  const login = await loginResponse(EMAIL, PASSWORD);
  const token = login.body.data.accessToken;

  const express = require("express");
  const { authenticate } = require("../src/middleware/auth.middleware");
  const { authorizeRoles } = require("../src/middleware/role.middleware");
  const errorHandler = require("../src/middleware/error.middleware");
  const testApp = express();
  testApp.get(
    "/probe",
    authenticate,
    authorizeRoles("AUDITOR_ANALYST"),
    (req, res) => res.status(200).json({ ok: true })
  );
  testApp.use(errorHandler);
  const probe = await request(testApp)
    .get("/probe")
    .set("Authorization", `Bearer ${token}`);

  assert.strictEqual(probe.status, 403);
  assert.strictEqual(probe.body.message, "Insufficient role permissions");
});

test("Rate limiting returns 429 after too many attempts", async () => {
  const attempts = [];
  for (let i = 0; i < 60; i += 1) {
    attempts.push(loginResponse("rate@ibvap.local", "wrong-password"));
  }
  const results = await Promise.all(attempts);
  const got429 = results.some((r) => r.status === 429);
  assert.strictEqual(got429, true);
});
