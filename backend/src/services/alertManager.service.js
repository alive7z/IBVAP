const alertRepository = require("../repositories/alert.repository");
const auditService = require("./audit.service");
const realtimeService = require("../realtime/realtime.service");
const env = require("../config/env");
const crypto = require("crypto");

// Phase 11 — Alert Manager.
//
// Node.js is the authoritative decision-maker for ALERT creation. It consumes
// the validated risk score / severity produced by the Phase 10 Risk Engine and
// decides, via a centralized policy, whether a SUSPICIOUS_ACTIVITY event
// becomes an alert. Python NEVER inserts alerts directly.
//
// Flow (per qualifying SUSPICIOUS_ACTIVITY event):
//   qualification -> deduplication -> create/escalate -> audit -> commit -> Socket.IO

const SEVERITY_ORDER = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

// Severities that are allowed to originate an alert under the current policy
// (bounded by ALERT_MIN_SEVERITY). Default policy: MEDIUM, HIGH and CRITICAL.
const policy = () => ({
  minSeverity: String(env.ALERT_MIN_SEVERITY || "MEDIUM").toUpperCase(),
  minRiskScore: Number(env.ALERT_MIN_RISK_SCORE || 40),
  dedupWindowSeconds: Number(env.ALERT_DEDUP_WINDOW_SECONDS || 30),
});

const VALID_ALERT_SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Always-on metrics (never throws). Reset-able for tests.
let metrics = {
  riskEventsEvaluated: 0,
  riskEventsQualified: 0,
  alertsCreated: 0,
  alertsDeduplicated: 0,
  alertsEscalated: 0,
  evidenceRequests: 0,
  averageDecisionLatencyMs: 0.0,
};

let decisionTotalMs = 0;
let decisionCount = 0;

const resetMetrics = () => {
  metrics = {
    riskEventsEvaluated: 0,
    riskEventsQualified: 0,
    alertsCreated: 0,
    alertsDeduplicated: 0,
    alertsEscalated: 0,
    evidenceRequests: 0,
    averageDecisionLatencyMs: 0.0,
  };
  decisionTotalMs = 0;
  decisionCount = 0;
};

const getMetrics = () => ({ ...metrics });

const _recordDecision = (latencyMs) => {
  decisionTotalMs += latencyMs;
  decisionCount += 1;
  if (decisionCount > 0) {
    metrics.averageDecisionLatencyMs = Math.round((decisionTotalMs / decisionCount) * 100) / 100;
  }
};

// A sensor data deduction. We never expose raw payloads or internal secrets.
const _reasonCodes = (event) => {
  const context = (event && event.context) || {};
  const reasons = context.reasons || [];
  if (Array.isArray(reasons)) {
    return reasons.map((r) => (typeof r === "string" ? r : String(r && r.code ? r.code : r)).toUpperCase()).sort();
  }
  return [];
};

// Build a stable, explainable dedup fingerprint: camera + track + risk reason
// group. Track IDs are session-scoped only (never treated as global identity),
// so the fingerprint is always bounded to the current camera/session/window.
const buildFingerprint = (event) => {
  const cameraCode = (event && event.camera_code) || "";
  const trackId = (event && event.track_id) || "";
  const context = (event && event.context) || {};
  const sessionId = context.streamSessionId || "legacy";
  const reasons = _reasonCodes(event);
  const reasonGroup = reasons.length ? reasons.join("|") : "UNKNOWN";
  return `${cameraCode}::${sessionId}::${trackId}::${reasonGroup}`;
};

// Stream-session identity lets a long-running track remain one incident even
// after the short duplicate window, while preventing a reused numeric track ID
// after reconnect from being merged with the old incident.
const buildIncidentKey = (event) => {
  const context = (event && event.context) || {};
  const sessionId = context.streamSessionId;
  if (!sessionId) return null;
  const cameraCode = (event && event.camera_code) || "";
  const trackId = (event && event.track_id) || "";
  return `${cameraCode}::${sessionId}::${trackId}`;
};

// ---- Qualification ----
// Only qualifying SUSPICIOUS_ACTIVITY events with a validated risk score and
// severity may become alerts. Raw detection/context events never qualify.
const qualifies = (event) => {
  const cfg = policy();
  if (!event) return false;
  if (String(event.event_type) !== "SUSPICIOUS_ACTIVITY") return false;

  const severity = String(event.severity || "INFO").toUpperCase();
  const score = Number(event.risk_score);

  if (!VALID_ALERT_SEVERITIES.includes(severity)) return false;
  if (!Number.isFinite(score) || score < 0 || score > 100) return false;
  // Preserve explainability: require at least one reason.
  if (_reasonCodes(event).length === 0) return false;

  const minRank = SEVERITY_ORDER[cfg.minSeverity] ?? SEVERITY_ORDER.HIGH;
  const rank = SEVERITY_ORDER[severity];
  if (rank < minRank) return false;
  if (score < cfg.minRiskScore) return false;

  return true;
};

const _fresh = (event) => ({
  eventId: event.id,
  cameraId: event.camera_id,
  severity: String(event.severity).toUpperCase(),
  riskScore: Number(event.risk_score),
  reason: {
    fingerprint: buildFingerprint(event),
    incidentKey: buildIncidentKey(event),
    reasons: _reasonCodes(event),
    source: "AI_RISK_ENGINE",
  },
});

// Find a NEW/ACTIVE incident matching the exact fingerprint inside the short
// dedup window. Longer-lived same-session escalation is handled separately by
// findActiveByIncidentKey; resolved incidents are never merged into.
const findActiveByFingerprint = async (fingerprint, cameraId) => {
  const [rows] = await alertRepository.getPool().execute(
    `SELECT a.id, a.alert_code, a.event_id, a.camera_id, a.alert_type, a.severity,
            a.risk_score, a.status, a.reason_json, a.created_at, a.updated_at
       FROM alerts a
      WHERE a.camera_id = ?
        AND a.status IN ('NEW','ACTIVE')
        AND JSON_UNQUOTE(JSON_EXTRACT(a.reason_json, '$.fingerprint')) = ?
        AND a.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
      ORDER BY a.created_at DESC LIMIT 1`,
    [cameraId, fingerprint, policy().dedupWindowSeconds]
  );
  return rows[0] || null;
};

const findActiveByIncidentKey = async (incidentKey, cameraId) => {
  if (!incidentKey) return null;
  const [rows] = await alertRepository.getPool().execute(
    `SELECT a.id, a.alert_code, a.event_id, a.camera_id, a.alert_type, a.severity,
            a.risk_score, a.status, a.reason_json, a.created_at, a.updated_at
       FROM alerts a
      WHERE a.camera_id = ?
        AND a.status IN ('NEW','ACTIVE','ACKNOWLEDGED','INVESTIGATING')
        AND JSON_UNQUOTE(JSON_EXTRACT(a.reason_json, '$.incidentKey')) = ?
      ORDER BY a.created_at DESC LIMIT 1`,
    [cameraId, incidentKey]
  );
  return rows[0] || null;
};

const _toAlertEvent = (alert, event) => ({
  alert_code: alert.alert_code,
  alert_type: "SUSPICIOUS_ACTIVITY",
  severity: alert.severity,
  risk_score: alert.risk_score,
  status: alert.status,
  camera_code: event && event.camera_code,
  camera_id: alert.camera_id,
  event_code: event && event.event_code,
  reason_json: alert.reason_json,
  created_at: alert.created_at,
  updated_at: alert.updated_at,
});

// Decision entry point. Handles creation, deduplication reuse, and escalation.
// Called AFTER the SUSPICIOUS_ACTIVITY event is committed, inside the same
// overall request. Returns an AlertAction descriptor (safe).
const processRiskEvent = async (event) => {
  const start = Date.now();
  metrics.riskEventsEvaluated += 1;

  if (!qualifies(event)) {
    _recordDecision(Date.now() - start);
    return { action: "NONE", eventId: event && event.id };
  }

  // Deduplication by fingerprint (camera + track + reason group window).
  const fingerprint = buildFingerprint(event);
  const incidentKey = buildIncidentKey(event);
  const existing =
    await findActiveByFingerprint(fingerprint, event.camera_id) ||
    await findActiveByIncidentKey(incidentKey, event.camera_id);

  let conn;
  try {
    conn = await alertRepository.beginTransaction();

    if (existing) {
      const currentRank = SEVERITY_ORDER[String(existing.severity).toUpperCase()];
      const newRank = SEVERITY_ORDER[String(event.severity).toUpperCase()];

      if (newRank > currentRank) {
        // Escalation: HIGH -> CRITICAL (never downgrade an unresolved incident).
        const escalated = await alertRepository.escalate({
          id: existing.id,
          severity: String(event.severity).toUpperCase(),
          riskScore: Number(event.risk_score),
          reasonJson: { ..._fresh(event).reason, escalatedFrom: existing.severity },
          conn,
        });
        await auditService.recordAudit(
          {
            userId: null,
            action: "ALERT_ESCALATED",
            entityType: "alert",
            entityId: escalated.alert_code,
            details: {
              alertCode: escalated.alert_code,
              fromSeverity: existing.severity,
              toSeverity: escalated.severity,
              riskScore: Number(event.risk_score),
            },
            ipAddress: null,
          },
          conn
        );
        await alertRepository.commit(conn);
        metrics.riskEventsQualified += 1;
        metrics.alertsEscalated += 1;
        _recordDecision(Date.now() - start);
        realtimeService.emitAlertUpdated(_toAlertEvent(escalated, event));
        return {
          action: "ESCALATED",
          alertId: escalated.id,
          alertCode: escalated.alert_code,
          eventId: event.id,
          evidenceRequested: true,
        };
      }

      // Same or lower severity -> deduplicated (reuse the existing active alert).
      await alertRepository.commit(conn);
      metrics.riskEventsQualified += 1;
      metrics.alertsDeduplicated += 1;
      _recordDecision(Date.now() - start);
      return {
        action: "DEDUPLICATED",
        alertId: existing.id,
        alertCode: existing.alert_code,
        eventId: event.id,
        evidenceRequested: false,
      };
    }

    // New active incident -> create alert.
    const created = await alertRepository.create({
      alertCode: crypto.randomUUID(),
      eventId: event.id,
      cameraId: event.camera_id,
      alertType: "SUSPICIOUS_ACTIVITY",
      severity: String(event.severity).toUpperCase(),
      riskScore: Number(event.risk_score),
      reason: _fresh(event).reason,
      status: "NEW",
      conn,
    });

    await auditService.recordAudit(
      {
        userId: null,
        action: "ALERT_CREATED",
        entityType: "alert",
        entityId: created.alert_code,
        details: {
          alertCode: created.alert_code,
          eventCode: event.event_code,
          severity: created.severity,
          riskScore: Number(event.risk_score),
          reasons: _reasonCodes(event),
        },
        ipAddress: null,
      },
      conn
    );

    await alertRepository.commit(conn);

    metrics.riskEventsQualified += 1;
    metrics.alertsCreated += 1;
    _recordDecision(Date.now() - start);
    realtimeService.emitAlertNew(_toAlertEvent(created, event));
    return {
      action: "CREATED",
      alertId: created.id,
      alertCode: created.alert_code,
      eventId: event.id,
      evidenceRequested: true,
    };
  } catch (err) {
    if (conn) await alertRepository.rollback(conn);
    throw err;
  } finally {
    if (conn) await alertRepository.release(conn);
  }
};

// Build the safe alertActions response for a batch of decisions.
const buildAlertActions = (observations, decisions) =>
  observations.map((obs, i) => {
    const d = decisions[i] || { action: "NONE" };
    return {
      observationId: obs.observationId,
      action: d.action,
      alertId: d.alertId || null,
      alertCode: d.alertCode || null,
      evidenceRequested: Boolean(d.evidenceRequested),
    };
  });

module.exports = {
  processRiskEvent,
  buildAlertActions,
  qualifies,
  buildFingerprint,
  buildIncidentKey,
  getMetrics,
  resetMetrics,
  policy,
  _reasonCodes,
};
