const dotenv = require("dotenv");

dotenv.config({ path: process.env.ENV_FILE || ".env" });

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 5001),
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  API_PREFIX: process.env.API_PREFIX || "/api",
  DB: {
    HOST: process.env.DB_HOST || "localhost",
    PORT: Number(process.env.DB_PORT || 3306),
    NAME: process.env.DB_NAME || "ibvap",
    USER: process.env.DB_USER || "ibvap_app",
    PASSWORD: process.env.DB_PASSWORD || "",
    CONNECTION_LIMIT: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  JWT: {
    SECRET: process.env.JWT_SECRET || "",
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
  },
  AI_SERVICE_TOKEN: process.env.AI_SERVICE_TOKEN || "",

  // Phase 13 — Runtime state (Redis is ephemeral/degraded-by-design; MySQL stays
  // authoritative for all permanent records). Redis failure never fails requests.
  REDIS_ENABLED: process.env.REDIS_ENABLED !== "false",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  CAMERA_RUNTIME_KEY_PREFIX: process.env.CAMERA_RUNTIME_KEY_PREFIX || "ibvap:camera",
  CAMERA_RUNTIME_TTL_SECONDS: Number(process.env.CAMERA_RUNTIME_TTL_SECONDS || 15),

  // Phase 13 — Python AI service URL (used only as the upstream for the secure
  // browser preview proxy). The browser never talks to the Python AI service and
  // never receives raw RTSP/credentials.
  AI_INTERNAL_URL: process.env.AI_INTERNAL_URL || "http://localhost:8001",

  // Phase 13 — Browser-compatible live preview.
  PREVIEW_ENABLED: process.env.PREVIEW_ENABLED !== "false",
  PREVIEW_TOKEN_TTL_SECONDS: Number(process.env.PREVIEW_TOKEN_TTL_SECONDS || 60),
  PREVIEW_TOKEN_SECRET: process.env.PREVIEW_TOKEN_SECRET || process.env.JWT_SECRET || "",

  // Phase 11 — Alert Manager policy (centralized; do not scatter thresholds).
  // MEDIUM/40 aligns the Node alert authority with the RiskEngine's own
  // severity bands (risk/rules.py: low=20, medium=40, high=60, critical=80).
  ALERT_MIN_SEVERITY: process.env.ALERT_MIN_SEVERITY || "MEDIUM",
  ALERT_MIN_RISK_SCORE: Number(process.env.ALERT_MIN_RISK_SCORE || 40),
  ALERT_DEDUP_WINDOW_SECONDS: Number(process.env.ALERT_DEDUP_WINDOW_SECONDS || 30),
  HIGH_ALERT_ESCALATION_SECONDS: Number(process.env.HIGH_ALERT_ESCALATION_SECONDS || 30),

  // Audit log retention cap — oldest excess rows are purged on cleanup.
  AUDIT_LOG_MAX_ROWS: Number(process.env.AUDIT_LOG_MAX_ROWS || 2000),

  // Phase 11 — Evidence metadata policy.
  EVIDENCE_ENABLED: process.env.EVIDENCE_ENABLED !== "false",

  isProduction: () => env.NODE_ENV === "production",
};

module.exports = env;
