const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const ALLOWED_SORT = ["created_at", "risk_score", "severity", "updated_at"];

const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ALERT_STATUSES = ["NEW", "ACTIVE", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"];

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const mapAlert = (row) => {
  if (!row) return null;
  return {
    ...row,
    reason: parseJson(row.reason_json),
  };
};

// Canonical alert summary counts for the Alerts page summary cards.
// totalActive = NEW/ACTIVE (per current active policy). Severity buckets count
// active (NEW/ACTIVE) alerts only. acknowledged = ACKNOWLEDGED status count.
// resolved/false_positive are excluded from totalActive by definition.
const getSummary = async () => {
  const [[row]] = await getPool().execute(
    `SELECT
       SUM(status IN ('NEW','ACTIVE')) AS totalActive,
       SUM(severity = 'CRITICAL' AND status IN ('NEW','ACTIVE')) AS critical,
       SUM(severity = 'HIGH' AND status IN ('NEW','ACTIVE')) AS high,
       SUM(severity = 'MEDIUM' AND status IN ('NEW','ACTIVE')) AS medium,
       SUM(status = 'ACKNOWLEDGED') AS acknowledged,
       SUM(status = 'RESOLVED') AS resolved
     FROM alerts
     WHERE deleted_at IS NULL`
  );
  return {
    totalActive: Number(row.totalActive || 0),
    critical: Number(row.critical || 0),
    high: Number(row.high || 0),
    medium: Number(row.medium || 0),
    acknowledged: Number(row.acknowledged || 0),
    resolved: Number(row.resolved || 0),
  };
};

const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT);

  const conditions = [];
  const params = [];

  if (!filters.includeDeleted) {
    conditions.push("a.deleted_at IS NULL");
  }
  if (filters.cameraId) {
    conditions.push("a.camera_id = (SELECT id FROM cameras WHERE camera_code = ?)");
    params.push(filters.cameraId);
  }
  if (filters.severity) {
    conditions.push("a.severity = ?");
    params.push(filters.severity);
  }
  if (filters.status) {
    conditions.push("a.status = ?");
    params.push(filters.status);
  }
  if (filters.alertType) {
    conditions.push("a.alert_type = ?");
    params.push(filters.alertType);
  }
  if (filters.minRiskScore !== undefined && filters.minRiskScore !== null && filters.minRiskScore !== "") {
    conditions.push("a.risk_score >= ?");
    params.push(filters.minRiskScore);
  }
  if (filters.startDate) {
    conditions.push("a.created_at >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("a.created_at < ?");
    params.push(filters.endDate);
  }
  if (filters.search) {
    conditions.push(
      "(a.alert_code LIKE ? OR a.alert_type LIKE ? OR EXISTS (SELECT 1 FROM cameras cs WHERE cs.id=a.camera_id AND (cs.camera_code LIKE ? OR cs.name LIKE ?)))"
    );
    const like = `%${filters.search}%`;
    params.push(like, like, like, like);
  }
  if (filters.operatorId) {
    conditions.push("(a.acknowledged_by = ? OR a.resolved_by = ?)");
    params.push(filters.operatorId, filters.operatorId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM alerts a ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT a.id, a.alert_code, a.event_id, a.camera_id, a.alert_type, a.severity,
            a.risk_score, a.status, a.reason_json, a.acknowledged_by,
            a.acknowledged_at, a.resolved_by, a.resolved_at, a.resolution_type,
            a.resolution_notes, a.investigation_started_at,
            a.escalated, a.escalated_at, a.escalated_to, a.escalation_reason,
            a.is_protected, a.protected_by, a.protected_at,
            a.deleted_at, a.deleted_by, a.deletion_reason,
            a.created_at, a.updated_at,
            c.camera_code, c.name AS camera_name,
            e.event_code, ack_user.full_name AS acknowledged_by_name
       FROM alerts a
       LEFT JOIN cameras c ON c.id = a.camera_id
       LEFT JOIN events e ON e.id = a.event_id
       LEFT JOIN users ack_user ON ack_user.id = a.acknowledged_by
       ${where}
       ORDER BY a.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapAlert),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findByCode = async (alertCode, { includeDeleted = false } = {}) => {
  const deletedClause = includeDeleted ? "" : " AND a.deleted_at IS NULL";
  const [rows] = await getPool().execute(
    `SELECT a.id, a.alert_code, a.event_id, a.camera_id, a.alert_type, a.severity,
            a.risk_score AS riskScore, a.status, a.reason_json, a.acknowledged_by,
            a.acknowledged_at, a.resolved_by, a.resolved_at, a.resolution_type,
            a.resolution_notes, a.investigation_started_at,
            a.escalated, a.escalated_at, a.escalated_to, a.escalation_reason,
            a.is_protected, a.protected_by, a.protected_at,
            a.deleted_at, a.deleted_by, a.deletion_reason,
            a.created_at AS createdAt, a.updated_at AS updatedAt,
            c.camera_code AS cameraCode, c.name AS cameraName,
            e.event_code AS eventCode, ack_user.full_name AS acknowledgedByName
       FROM alerts a
       LEFT JOIN cameras c ON c.id = a.camera_id
       LEFT JOIN events e ON e.id = a.event_id
       LEFT JOIN users ack_user ON ack_user.id = a.acknowledged_by
       WHERE a.alert_code = ?${deletedClause} LIMIT 1`,
    [alertCode]
  );
  return mapAlert(rows[0] || null);
};

const findById = async (id) => {
  const [rows] = await getPool().execute(
    `SELECT id, alert_code, event_id, camera_id, alert_type, severity, risk_score,
            status, reason_json, acknowledged_by, acknowledged_at, resolved_by,
            resolved_at, resolution_type, resolution_notes, investigation_started_at,
            escalated, escalated_at, escalated_to, escalation_reason,
            is_protected, protected_by, protected_at,
            deleted_at, deleted_by, deletion_reason,
            created_at, updated_at
       FROM alerts WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const resolveCodeToId = async (alertCode) => {
  const [rows] = await getPool().execute(
    "SELECT id FROM alerts WHERE alert_code = ? LIMIT 1",
    [alertCode]
  );
  return rows[0] ? rows[0].id : null;
};

const acknowledge = async ({ id, userId, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = UTC_TIMESTAMP()
      WHERE id = ?`,
    [userId, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const startInvestigation = async ({ id, userId, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET status = 'INVESTIGATING', acknowledged_by = COALESCE(acknowledged_by, ?),
            acknowledged_at = COALESCE(acknowledged_at, UTC_TIMESTAMP()),
            investigation_started_at = UTC_TIMESTAMP()
      WHERE id = ?`,
    [userId, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const markFalsePositive = async ({ id, userId, notes, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET status = 'FALSE_POSITIVE', resolved_by = ?, resolved_at = UTC_TIMESTAMP(),
            resolution_type = 'FALSE_POSITIVE', resolution_notes = ?,
            acknowledged_by = COALESCE(acknowledged_by, ?)
      WHERE id = ?`,
    [userId, notes || null, userId, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const escalateForReview = async ({ id, reason, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET escalated = 1, escalated_at = UTC_TIMESTAMP(), escalated_to = 'ADMINISTRATOR',
            escalation_reason = ?
      WHERE id = ? AND escalated = 0`,
    [reason || null, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const findOverdueHighAlerts = async (seconds, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT id, alert_code, event_id, camera_id, alert_type, severity, risk_score,
            status, reason_json, created_at, updated_at
       FROM alerts
      WHERE deleted_at IS NULL
        AND is_protected IN (0, 1)
        AND severity = 'HIGH'
        AND status IN ('NEW','ACTIVE')
        AND escalated = 0
        AND created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
      ORDER BY created_at ASC`,
    [seconds]
  );
  return rows.map(mapAlert);
};

const markTimedEscalated = async ({ id, reason, conn }) => {
  const [result] = await (conn || getPool()).execute(
    `UPDATE alerts
        SET escalated = 1, escalated_at = UTC_TIMESTAMP(),
            escalated_to = 'ADMINISTRATOR', escalation_reason = ?
      WHERE id = ? AND deleted_at IS NULL AND escalated = 0
        AND severity = 'HIGH' AND status IN ('NEW','ACTIVE')`,
    [reason, id]
  );
  if (!result.affectedRows) return null;
  return findByCodeWithExecutor(id, conn);
};

const protect = async ({ id, userId, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET is_protected = 1, protected_by = ?, protected_at = UTC_TIMESTAMP()
      WHERE id = ?`,
    [userId, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const unprotect = async ({ id, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET is_protected = 0, protected_by = NULL, protected_at = NULL
      WHERE id = ?`,
    [id]
  );
  return findByCodeWithExecutor(id, conn);
};

const softDelete = async ({ id, userId, reason, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, deletion_reason = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [userId, reason || null, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const resolve = async ({ id, userId, resolutionType, resolutionNotes, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET status = 'RESOLVED', resolved_by = ?, resolved_at = UTC_TIMESTAMP(),
            resolution_type = ?, resolution_notes = ?
      WHERE id = ?`,
    [userId, resolutionType, resolutionNotes || null, id]
  );
  return findByCodeWithExecutor(id, conn);
};

const findByCodeWithExecutor = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT a.id, a.alert_code, a.event_id, a.camera_id, a.alert_type, a.severity,
            a.risk_score AS riskScore, a.status, a.reason_json, a.acknowledged_by,
            a.acknowledged_at, a.resolved_by, a.resolved_at, a.resolution_type,
            a.resolution_notes, a.investigation_started_at,
            a.escalated, a.escalated_at, a.escalated_to, a.escalation_reason,
            a.is_protected, a.protected_by, a.protected_at,
            a.deleted_at, a.deleted_by, a.deletion_reason,
            a.created_at AS createdAt, a.updated_at AS updatedAt,
            c.camera_code AS cameraCode, c.name AS cameraName,
            e.event_code AS eventCode, ack_user.full_name AS acknowledgedByName
       FROM alerts a
       LEFT JOIN cameras c ON c.id = a.camera_id
       LEFT JOIN events e ON e.id = a.event_id
       LEFT JOIN users ack_user ON ack_user.id = a.acknowledged_by
       WHERE a.id = ? LIMIT 1`,
    [id]
  );
  return mapAlert(rows[0] || null);
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};

const commit = async (conn) => conn.commit();
const rollback = async (conn) => conn.rollback();
const release = async (conn) => conn.release();

// Create a new alert (Phase 11). reason_json stores the explainable reasons plus
// a deterministic dedup fingerprint generated by the Alert Manager.
const create = async (data) => {
  const executor = data.conn || getPool();
  const [result] = await executor.execute(
    `INSERT INTO alerts
       (alert_code, event_id, camera_id, alert_type, severity, risk_score,
        status, reason_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.alertCode,
      data.eventId,
      data.cameraId,
      data.alertType || "SUSPICIOUS_ACTIVITY",
      data.severity,
      data.riskScore,
      data.status || "NEW",
      data.reason ? JSON.stringify(data.reason) : null,
    ]
  );
  return findByIdWithExecutor(result.insertId, data.conn);
};

// Escalate an active alert (only upward severity/score). A connectable update;
// used when the same incident becomes HIGH -> CRITICAL.
const escalate = async ({ id, severity, riskScore, reasonJson, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE alerts
        SET severity = ?, risk_score = ?, reason_json = ?, status = 'ACTIVE'
      WHERE id = ?`,
    [severity, riskScore, reasonJson ? JSON.stringify(reasonJson) : null, id]
  );
  return findByIdWithExecutor(id, conn);
};

const findByIdWithExecutor = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT a.id, a.alert_code, a.event_id, a.camera_id, a.alert_type, a.severity,
            a.risk_score, a.status, a.reason_json, a.acknowledged_by,
            a.acknowledged_at, a.resolved_by, a.resolved_at, a.resolution_type,
            a.resolution_notes, a.investigation_started_at,
            a.escalated, a.escalated_at, a.escalated_to, a.escalation_reason,
            a.is_protected,
            a.created_at AS createdAt, a.updated_at AS updatedAt,
            c.camera_code AS cameraCode, c.name AS cameraName,
            e.event_code AS eventCode, ack_user.full_name AS acknowledgedByName
       FROM alerts a
       LEFT JOIN cameras c ON c.id = a.camera_id
       LEFT JOIN events e ON e.id = a.event_id
       LEFT JOIN users ack_user ON ack_user.id = a.acknowledged_by
       WHERE a.id = ? LIMIT 1`,
    [id]
  );
  return mapAlert(rows[0] || null);
};

module.exports = {
  getSummary,
  findMany,
  findByCode,
  findById,
  resolveCodeToId,
  acknowledge,
  startInvestigation,
  markFalsePositive,
  escalateForReview,
  findOverdueHighAlerts,
  markTimedEscalated,
  protect,
  unprotect,
  softDelete,
  resolve,
  beginTransaction,
  commit,
  rollback,
  release,
  create,
  escalate,
  getPool: () => getPool(),
  SEVERITIES,
  ALERT_STATUSES,
};
