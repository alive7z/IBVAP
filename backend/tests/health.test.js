const { test, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/app");
const { closeDatabasePool } = require("../src/config/database");

after(async () => {
  await closeDatabasePool();
});

test("GET /api returns root API info", async () => {
  const res = await request(app).get("/api");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.status, "running");
});

test("GET /api/health reports database status structure", async () => {
  const res = await request(app).get("/api/health");

  assert.ok(res.status === 200 || res.status === 503, `unexpected status ${res.status}`);

  if (res.status === 200) {
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, "IBVAP Backend is running");
    assert.strictEqual(res.body.data.service, "IBVAP API");
    assert.strictEqual(res.body.data.database.status, "connected");
  } else {
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.message, "IBVAP Backend running, but database is unavailable");
  }
});

test("GET unknown route returns 404 JSON", async () => {
  const res = await request(app).get("/api/does-not-exist");
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, "Route not found");
});

test("disallowed browser origin is rejected as 403 instead of a server error", async () => {
  const res = await request(app)
    .options("/api/events")
    .set("Origin", "https://untrusted.example")
    .set("Access-Control-Request-Method", "GET");

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.success, false);
});
