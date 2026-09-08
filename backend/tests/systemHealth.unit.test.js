const test = require("node:test");
const assert = require("node:assert/strict");
const { mapCameraRtspStatus } = require("../src/services/system.service");

test("camera/RTSP health distinguishes live, reconnecting, offline, and unconfigured", () => {
  assert.strictEqual(mapCameraRtspStatus("ONLINE", true), "HEALTHY");
  assert.strictEqual(mapCameraRtspStatus("RECONNECTING", true), "DEGRADED");
  assert.strictEqual(mapCameraRtspStatus("ERROR", true), "OFFLINE");
  assert.strictEqual(mapCameraRtspStatus("NOT_CONFIGURED", false), "NOT_CONFIGURED");
});
