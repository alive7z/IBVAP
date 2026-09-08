const env = require("../config/env");
const { getPool } = require("../config/database");
const { sendSuccess, sendError } = require("../utils/ApiResponse");
const alertManager = require("../services/alertManager.service");
const redis = require("../config/redis");

const getHealth = async (req, res) => {
  let databaseStatus = "disconnected";

  try {
    await getPool().query("SELECT 1");
    databaseStatus = "connected";
  } catch (err) {
    databaseStatus = "disconnected";
  }

  const redisEnabled = redis.isEnabled();
  const data = {
    service: "IBVAP API",
    status: "healthy",
    environment: env.NODE_ENV,
    database: {
      status: databaseStatus,
    },
    redis: {
      enabled: redisEnabled,
      status: redisEnabled
        ? redis.isHealthy()
          ? "healthy"
          : "degraded"
        : "disabled",
    },
    preview: {
      enabled: env.PREVIEW_ENABLED,
    },
    alertManager: {
      enabled: true,
      status: "READY",
      minSeverity: alertManager.policy().minSeverity,
      minRiskScore: alertManager.policy().minRiskScore,
      dedupWindowSeconds: alertManager.policy().dedupWindowSeconds,
      metrics: alertManager.getMetrics(),
    },
    evidence: {
      enabled: env.EVIDENCE_ENABLED,
      status: env.EVIDENCE_ENABLED ? "READY" : "DISABLED",
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  if (databaseStatus === "disconnected") {
    return sendError(res, 503, "IBVAP Backend running, but database is unavailable", null);
  }

  return sendSuccess(res, 200, "IBVAP Backend is running", data);
};

module.exports = { getHealth };
