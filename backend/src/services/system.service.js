const fs = require("fs/promises");
const path = require("path");
const { getPool } = require("../config/database");
const systemRepository = require("../repositories/system.repository");
const env = require("../config/env");
const redis = require("../config/redis");
const { getIO } = require("../realtime/socket");

const mapCameraRtspStatus = (status, configured) => {
  if (!configured || status === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  if (status === "ONLINE") return "HEALTHY";
  if (["CONNECTING", "RECONNECTING", "STALE", "EOF"].includes(status)) return "DEGRADED";
  return "OFFLINE";
};

const aiRuntimeStatus = async () => {
  try {
    const response = await fetch(`${env.AI_INTERNAL_URL.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return { aiEngine: "DEGRADED", cameraRtsp: "OFFLINE", anpr: "UNKNOWN" };
    const health = await response.json();
    const modelReady = health?.model?.loaded === true;
    const subsystemDegraded = [
      health?.context?.status,
      health?.risk?.status,
      health?.anpr?.status,
      health?.faceDetection?.status,
    ].some((value) => ["DEGRADED", "ERROR", "UNAVAILABLE"].includes(value));
    return {
      aiEngine: modelReady && !subsystemDegraded ? "HEALTHY" : "DEGRADED",
      cameraRtsp: mapCameraRtspStatus(
        health?.videoSource?.status || health?.stream?.status,
        Boolean(health?.videoSource?.configured)
      ),
      anpr: health?.anpr?.status || "UNKNOWN",
    };
  } catch (err) {
    return { aiEngine: "OFFLINE", cameraRtsp: "OFFLINE", anpr: "UNKNOWN" };
  }
};

const evidenceStorageStatus = async () => {
  const root = path.resolve(__dirname, "..", "..", "..", "storage");
  try {
    await fs.access(root, fs.constants.R_OK | fs.constants.W_OK);
    return "HEALTHY";
  } catch (err) {
    return "OFFLINE";
  }
};

const status = async () => {
  let database = "disconnected";
  try {
    await getPool().query("SELECT 1");
    database = "connected";
  } catch (err) {
    database = "disconnected";
  }

  const [ai, evidenceStorage] = await Promise.all([
    aiRuntimeStatus(),
    evidenceStorageStatus(),
  ]);

  const payload = {
    backend: "HEALTHY",
    database: database === "connected" ? "HEALTHY" : "OFFLINE",
    aiEngine: ai.aiEngine,
    cameraRtsp: ai.cameraRtsp,
    anpr: ai.anpr,
    redis: !redis.isEnabled() ? "NOT_CONFIGURED" : redis.isHealthy() ? "HEALTHY" : "DEGRADED",
    evidenceStorage,
    socketIo: getIO() ? "HEALTHY" : "UNKNOWN",
  };

  if (database === "connected") {
    payload.cameras = {
      recordedState: await systemRepository.cameraStatusSummary(),
      note: "Recorded stream status from the database, not a live connectivity probe.",
    };
  }

  return payload;
};

module.exports = { status, mapCameraRtspStatus };
