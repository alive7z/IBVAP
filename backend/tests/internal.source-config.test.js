const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const env = require("../src/config/env");

let pool;
const SERVICE_TOKEN = env.AI_SERVICE_TOKEN || "test-service-token";
const CODES = [
  "CAM-SRC-FILE",
  "CAM-SRC-RTSP",
  "CAM-SRC-HTTP",
  "CAM-SRC-MOBILE",
  "CAM-SRC-OTHER",
];

const cleanup = async () => {
  await pool.execute(
    `DELETE FROM cameras WHERE camera_code IN (${CODES.map(() => "?").join(",")})`,
    CODES
  ).catch(() => {});
};

const insertCamera = async ({ code, sourceType, protocol, streamUrl, enabled = 1, rotationDegrees = 0 }) => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_protocol, stream_url, rotation_degrees,
        stream_status, ai_status, enabled)
     VALUES (?, ?, ?, ?, ?, ?, 'ONLINE', 'ACTIVE', ?)`,
    [code, code, sourceType, protocol, streamUrl, rotationDegrees, enabled]
  );
  return result.insertId;
};

before(async () => {
  pool = getPool();
  await cleanup();
  await insertCamera({ code: "CAM-SRC-FILE", sourceType: "VIDEO_FILE", protocol: null, streamUrl: "/tmp/demo.mp4" });
  await insertCamera({ code: "CAM-SRC-RTSP", sourceType: "IP_CAMERA", protocol: "RTSP", streamUrl: "rtsp://user:pass@127.0.0.1/live" });
  await insertCamera({ code: "CAM-SRC-HTTP", sourceType: "IP_CAMERA", protocol: "HTTP", streamUrl: "http://127.0.0.1/mjpeg" });
  await insertCamera({ code: "CAM-SRC-MOBILE", sourceType: "MOBILE", protocol: "HTTP", streamUrl: "http://192.168.1.50:8080/video", rotationDegrees: 90 });
  await insertCamera({ code: "CAM-SRC-OTHER", sourceType: "OTHER", protocol: null, streamUrl: null });
});

after(async () => {
  await cleanup();
  await closeDatabasePool();
});

test("source-config missing service token is rejected with 401", async () => {
  const res = await request(app).get("/api/internal/ai/cameras/CAM-SRC-RTSP/source-config");
  assert.strictEqual(res.status, 401);
});

test("source-config invalid token is rejected with 401", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-SRC-RTSP/source-config")
    .set("X-IBVAP-AI-Key", "wrong-token");
  assert.strictEqual(res.status, 401);
});

test("source-config unknown camera is 404", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-DOES-NOT-EXIST/source-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 404);
});

test("VIDEO_FILE camera returns VIDEO_FILE sourceType", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-SRC-FILE/source-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.cameraCode, "CAM-SRC-FILE");
  assert.strictEqual(res.body.data.sourceType, "VIDEO_FILE");
  assert.strictEqual(res.body.data.streamUrl, "/tmp/demo.mp4");
  assert.strictEqual(res.body.data.enabled, true);
});

test("IP_CAMERA + RTSP returns RTSP live sourceType with streamUrl", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-SRC-RTSP/source-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.sourceType, "RTSP");
  assert.strictEqual(res.body.data.protocol, "RTSP");
  assert.strictEqual(res.body.data.streamUrl, "rtsp://user:pass@127.0.0.1/live");
  assert.strictEqual(res.body.data.classification, "IP_CAMERA");
});

test("IP_CAMERA + HTTP returns HTTP live sourceType", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-SRC-HTTP/source-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.body.data.sourceType, "HTTP");
  assert.strictEqual(res.body.data.protocol, "HTTP");
});

test("MOBILE camera returns MOBILE sourceType", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-SRC-MOBILE/source-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.sourceType, "MOBILE");
  assert.strictEqual(res.body.data.protocol, "HTTP");
  assert.strictEqual(res.body.data.classification, "MOBILE");
  assert.strictEqual(res.body.data.rotationDegrees, 90);
});

test("OTHER classification is rejected with 400", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-SRC-OTHER/source-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 400);
});
