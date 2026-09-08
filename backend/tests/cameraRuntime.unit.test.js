const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runtimeFromHealthPayload } = require("../src/services/cameraRuntime.service");

test("Python fallback accepts canonical top-level camera plus videoSource health", () => {
  const runtime = runtimeFromHealthPayload(
    {
      cameraCode: "CAM-01",
      videoSource: {
        status: "ONLINE",
        sourceType: "MOBILE",
        framesRead: 42,
        framesProcessed: 21,
        lastFrameTimestamp: "2026-09-04T12:00:00Z",
      },
      stream: {},
    },
    "CAM-01"
  );

  assert.equal(runtime.status, "ONLINE");
  assert.equal(runtime.framesRead, 42);
  assert.equal(runtime.framesProcessed, 21);
  assert.equal(runtime.lastFrameAt, "2026-09-04T12:00:00Z");
});

test("fresh videoSource status wins over stale stream heartbeat status", () => {
  const runtime = runtimeFromHealthPayload(
    {
      cameraCode: "CAM-01",
      videoSource: { status: "ONLINE", framesRead: 5 },
      stream: { cameraCode: "CAM-01", status: "CONNECTING", protocol: "RTSP" },
    },
    "CAM-01"
  );

  assert.equal(runtime.status, "ONLINE");
  assert.equal(runtime.protocol, "RTSP");
});

test("Python fallback never maps health from a different camera", () => {
  const runtime = runtimeFromHealthPayload(
    {
      cameraCode: "CAM-02",
      videoSource: { status: "ONLINE" },
      stream: { cameraCode: "CAM-02", status: "ONLINE" },
    },
    "CAM-01"
  );

  assert.equal(runtime, null);
});
