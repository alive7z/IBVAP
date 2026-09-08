const http = require("http");
const https = require("https");
const { URL } = require("url");
const cameraRepository = require("../repositories/camera.repository");
const cameraService = require("./camera.service");
const redis = require("../config/redis");
const env = require("../config/env");

// Fallback live source of truth when the optional Redis cache is unavailable.
// Python is the live authority for whether a stream is actually ONLINE; reading
// its /health here is graceful degradation, never MySQL corruption, and the
// payload below never contains stream_url/credentials.
const runtimeFromHealthPayload = (parsed, cameraCode) => {
  if (!parsed || typeof parsed !== "object") return null;
  const stream = parsed.stream && typeof parsed.stream === "object" ? parsed.stream : {};
  const video = parsed.videoSource && typeof parsed.videoSource === "object"
    ? parsed.videoSource
    : {};

  // /health exposes the camera identity at the top level and richer transport
  // metadata under stream. Accept either shape, but never cross camera IDs.
  const reportedCameraCode = parsed.cameraCode || stream.cameraCode;
  if (reportedCameraCode !== cameraCode) return null;

  // Stream metadata refreshes on a heartbeat; videoSource is read directly
  // from StreamHealth and is therefore the freshest status/counter source.
  const status = video.status || stream.status;
  if (!status) return null;

  return {
    status,
    sourceType: stream.sourceType || video.sourceType || null,
    protocol: stream.protocol || null,
    streamSessionId: stream.streamSessionId || null,
    reconnectAttempts: stream.reconnectAttempts || 0,
    lastFrameAt: stream.lastFrameAt || video.lastFrameTimestamp || null,
    framesRead: video.framesRead || 0,
    framesProcessed: video.framesProcessed || 0,
    lastHeartbeatAt: stream.lastHeartbeatAt || null,
  };
};

const fetchPythonRuntime = (cameraCode) =>
  new Promise((resolve) => {
    let upstreamUrl;
    try {
      upstreamUrl = new URL(env.AI_INTERNAL_URL);
    } catch (e) {
      return resolve(null);
    }
    const lib = upstreamUrl.protocol === "https:" ? https : http;
    const req = lib.get(
      {
        host: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
        path: "/health",
        timeout: 2500,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 65536) res.destroy();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve(runtimeFromHealthPayload(parsed, cameraCode));
            return;
          } catch (e) {
            // fall through
          }
          resolve(null);
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });

// Merge ephemeral runtime state (Redis — or the AI engine when the optional
// Redis cache is down) with the DB camera row into a SAFE status payload.
// Explicitly excludes stream_url/credentials — never exposed publicly.
const runtimeStatusForCamera = async (cameraCode) => {
  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera || camera.deleted_at) return null;

  let runtime = await redis.getCameraRuntime(cameraCode);
  const redisAvailable = redis.isEnabled() && redis.isHealthy();

  // Redis is only a cache, not a source of truth. A missing/expired entry is
  // not authoritative (a live camera may simply have no recent heartbeat), so
  // always ask the AI engine when no runtime entry exists.
  if (!runtime || String(runtime.status || "").toUpperCase() !== "ONLINE") {
    const pythonRuntime = await fetchPythonRuntime(cameraCode);
    if (
      pythonRuntime &&
      (!runtime || String(pythonRuntime.status || "").toUpperCase() === "ONLINE")
    ) {
      runtime = pythonRuntime;
    }
  }

  const live = String(runtime?.status || "").toUpperCase() === "ONLINE";

  return {
    ...cameraService.toSafeCamera(camera),
    live,
    runtime: runtime
      ? {
          status: runtime.status || null,
          sourceType: runtime.sourceType || null,
          protocol: runtime.protocol || null,
          streamSessionId: runtime.streamSessionId || null,
          lastSessionId: runtime.lastSessionId || null,
          sessionChanged: Boolean(runtime.sessionChanged),
          reconnectAttempts: runtime.reconnectAttempts || 0,
          lastFrameAt: runtime.lastFrameAt || runtime.lastFrameTimestamp || null,
          framesRead: runtime.framesRead || 0,
          framesProcessed: runtime.framesProcessed || 0,
          lastHeartbeatAt: runtime.lastHeartbeatAt || null,
        }
      : null,
    redisAvailable,
  };
};

// Bulk runtime map keyed by cameraCode (Redis) — used to annotate camera lists.
const getAllRuntimeAsync = async () => redis.getAllRuntime();

module.exports = {
  runtimeStatusForCamera,
  getAllRuntimeAsync,
  fetchPythonRuntime,
  runtimeFromHealthPayload,
};
