const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const env = require("../src/config/env");
const previewService = require("../src/services/preview.service");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");

let pool;
const CAMERA_CODE = "CAM-13-DEBUG";

// Build the same `${cameraCode}.${expiryMs}`, HMAC-signed token the preview
// service uses, so expired/tampered cases can be exercised deterministically.
const makeToken = (cameraCode, expiryMs) => {
  const payload = `${cameraCode}.${expiryMs}`;
  const sig = crypto
    .createHmac("sha256", env.PREVIEW_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
};

const tokenFromUrl = (previewUrl) => previewUrl.replace("/api/preview/", "");

const ADMIN = {
  email: "phase13.admin@ibvap.local",
  password: "Phase13Admin#2026!",
};
const OPERATOR = {
  email: "phase13.operator@ibvap.local",
  password: "Phase13Oper#2026!",
};

const cleanUsers = async () => {
  await pool
    .execute("DELETE FROM users WHERE email IN (?, ?)", [ADMIN.email, OPERATOR.email])
    .catch(() => {});
};
const cleanupCamera = async () => {
  await pool
    .execute("DELETE FROM cameras WHERE camera_code = ?", [CAMERA_CODE])
    .catch(() => {});
};
const insertCamera = async () => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, location_name, sector, source_type, stream_protocol,
        stream_url, stream_status, ai_status, enabled)
     VALUES (?, ?, ?, ?, 'MOBILE', 'RTSP', ?, 'NOT_CONFIGURED', 'NOT_CONFIGURED', 1)`,
    [CAMERA_CODE, "Phase 13 Debug Camera", "Test Area", "Sector 13", "rtsp://cam.example.invalid/live"]
  );
  return result.insertId;
};

const loginToken = async (user) => {
  const res = await request(app).post("/api/auth/login").send(user);
  assert.strictEqual(res.status, 200, `login failed for ${user.email}`);
  return res.body.data.accessToken;
};

before(async () => {
  pool = getPool();
  await cleanUsers();
  await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'ADMINISTRATOR', 'ACTIVE'), (?, ?, ?, ?, 'SECURITY_OPERATOR', 'ACTIVE')`,
    [
      crypto.randomUUID(), "Phase13 Admin", ADMIN.email, await hashPassword(ADMIN.password),
      crypto.randomUUID(), "Phase13 Operator", OPERATOR.email, await hashPassword(OPERATOR.password),
    ]
  );
  await cleanupCamera();
  const cameraId = await insertCamera();
  const [operatorRows] = await pool.execute("SELECT id FROM users WHERE email = ?", [OPERATOR.email]);
  const [adminRows] = await pool.execute("SELECT id FROM users WHERE email = ?", [ADMIN.email]);
  await pool.execute(
    `INSERT INTO operator_camera_assignments (operator_id, camera_id, assigned_by)
     VALUES (?, ?, ?)`,
    [operatorRows[0].id, cameraId, adminRows[0].id]
  );
  const [cam01Rows] = await pool.execute("SELECT id FROM cameras WHERE camera_code = 'CAM-01' LIMIT 1");
  if (cam01Rows[0]) {
    await pool.execute(
      `INSERT IGNORE INTO operator_camera_assignments (operator_id, camera_id, assigned_by)
       VALUES (?, ?, ?)`,
      [operatorRows[0].id, cam01Rows[0].id, adminRows[0].id]
    );
  }
  adminToken = await loginToken(ADMIN);
  operatorToken = await loginToken(OPERATOR);
});

let adminToken;
let operatorToken;

after(async () => {
  await cleanupCamera();
  await cleanUsers();
  await closeDatabasePool();
});

// GET /api/cameras/CAM-13-DEBUG — public detail resolved by camera_code.
test("GET /api/cameras/:code returns the camera by code and never stream_url", async () => {
  const res = await request(app)
    .get(`/api/cameras/${CAMERA_CODE}`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.camera.cameraCode, CAMERA_CODE);
  assert.strictEqual(res.body.data.camera.name, "Phase 13 Debug Camera");
  assert.strictEqual(res.body.data.camera.locationName, "Test Area");
  assert.strictEqual(res.body.data.camera.sector, "Sector 13");
  assert.strictEqual("stream_url" in res.body.data.camera, false, "stream_url must be stripped");
  assert.strictEqual("streamUrl" in res.body.data.camera, false, "streamUrl must be stripped");
});

test("GET /api/cameras/:code unknown camera is 404", async () => {
  const res = await request(app)
    .get("/api/cameras/CAM-DOES-NOT-EXIST")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 404);
});

test("GET /api/cameras/:code/runtime-status returns SAFE runtime shape by code", async () => {
  const res = await request(app)
    .get(`/api/cameras/${CAMERA_CODE}/runtime-status`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 200);
  const camera = res.body.data.camera;
  assert.strictEqual(camera.cameraCode, CAMERA_CODE);
  assert.ok("live" in camera);
  assert.ok("runtime" in camera);
  assert.ok("redisAvailable" in camera);
  assert.strictEqual("stream_url" in camera, false, "stream_url must be stripped");
  assert.strictEqual("streamUrl" in camera, false, "streamUrl must be stripped");
});

test("GET /api/cameras/:code/runtime-status unknown camera is 404", async () => {
  const res = await request(app)
    .get("/api/cameras/CAM-DOES-NOT-EXIST/runtime-status")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 404);
});

test("GET /api/cameras/:code/preview-token (operator) returns tokenized preview URL", async () => {
  const res = await request(app)
    .get(`/api/cameras/${CAMERA_CODE}/preview-token`)
    .set("Authorization", `Bearer ${operatorToken}`);
  assert.strictEqual(res.status, 200);
  const { previewUrl } = res.body.data;
  assert.ok(typeof previewUrl === "string" && previewUrl.startsWith("/api/preview/"), "tokenized preview URL expected");
  assert.ok(!previewUrl.includes("rtsp://"), "preview URL must not expose RTSP");
  assert.ok(!previewUrl.includes(CAMERA_CODE), "raw camera code must not be embedded in the URL");
});

test("operator cannot preview an unassigned camera", async () => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_protocol, stream_url, stream_status, ai_status, enabled)
     VALUES ('CAM-13-UNASSIGNED', 'Unassigned', 'MOBILE', 'RTSP',
             'rtsp://cam.example.invalid/unassigned', 'NOT_CONFIGURED', 'NOT_CONFIGURED', 1)`
  );
  try {
    const res = await request(app)
      .get("/api/cameras/CAM-13-UNASSIGNED/preview-token")
      .set("Authorization", `Bearer ${operatorToken}`);
    assert.strictEqual(res.status, 403);
  } finally {
    await pool.execute("DELETE FROM cameras WHERE id = ?", [result.insertId]);
  }
});

test("GET /api/cameras/:code/preview-token requires operator/admin role", async () => {
  // AUDITOR is not seeded here; a missing token must be rejected outright.
  const res = await request(app).get(`/api/cameras/${CAMERA_CODE}/preview-token`);
  assert.strictEqual(res.status, 401);
});

test("public preview route rejects a malformed token", async () => {
  const res = await request(app).get("/api/preview/not-a-valid-token");
  assert.strictEqual(res.status, 401);
});

test("preview token resolves to the issuing camera — never undefined", async () => {
  const res = await request(app)
    .get(`/api/cameras/${CAMERA_CODE}/preview-token`)
    .set("Authorization", `Bearer ${operatorToken}`);
  assert.strictEqual(res.status, 200);
  const token = tokenFromUrl(res.body.data.previewUrl);
  assert.strictEqual(previewService.resolveToken(token), CAMERA_CODE);
  assert.notStrictEqual(previewService.resolveToken(token), undefined);
});

test("CAM-01 preview token resolves to CAM-01 (regression: undefined cameraCode)", async () => {
  const res = await request(app)
    .get("/api/cameras/CAM-01/preview-token")
    .set("Authorization", `Bearer ${operatorToken}`);
  assert.strictEqual(res.status, 200);
  const token = tokenFromUrl(res.body.data.previewUrl);
  assert.strictEqual(previewService.resolveToken(token), "CAM-01");
  assert.notStrictEqual(previewService.resolveToken(token), undefined);
});

test("GET /api/cameras/:code/preview-token unknown camera is 404", async () => {
  const res = await request(app)
    .get("/api/cameras/CAM-DOES-NOT-EXIST/preview-token")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 404);
});

test("public preview route rejects an EXPIRED token", async () => {
  const token = makeToken(CAMERA_CODE, Date.now() - 60000);
  const res = await request(app).get(`/api/preview/${token}`);
  assert.strictEqual(res.status, 401);
});

test("public preview route rejects a TAMPERED token", async () => {
  const issued = await request(app)
    .get(`/api/cameras/${CAMERA_CODE}/preview-token`)
    .set("Authorization", `Bearer ${operatorToken}`);
  const token = tokenFromUrl(issued.body.data.previewUrl);
  const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  const res = await request(app).get(`/api/preview/${flipped}`);
  assert.strictEqual(res.status, 401);
});
