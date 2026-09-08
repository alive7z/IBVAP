// Operator repository — SECURITY_OPERATOR user management, camera assignment,
// presence (online/offline/idle), and per-operator operational analytics.
const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const ALLOWED_SORT = ["created_at", "full_name", "last_seen_at", "online_status"];

const mapOperator = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    onlineStatus: row.online_status || "OFFLINE",
    connectedAt: row.connected_at || null,
    lastSeenAt: row.last_seen_at || null,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null,
    assignedCameraCount: Number(row.assigned_camera_count || 0),
    assignedCameras: Array.isArray(row.assigned_cameras_json)
      ? row.assigned_cameras_json
      : (() => {
          try {
            return row.assigned_cameras_json ? JSON.parse(row.assigned_cameras_json) : [];
          } catch {
            return [];
          }
        })(),
    alertsReceived: Number(row.alerts_received || 0),
    alertsAcknowledged: Number(row.alerts_acknowledged || 0),
    mediumAcknowledged: Number(row.medium_acknowledged || 0),
    highAcknowledged: Number(row.high_acknowledged || 0),
    criticalEscalated: Number(row.critical_escalated || 0),
    alertsResolved: Number(row.alerts_resolved || 0),
    pendingAlerts: Number(row.pending_alerts || 0),
    avgAcknowledgeMinutes: row.avg_ack_minutes === null || row.avg_ack_minutes === undefined
      ? null
      : Number(Number(row.avg_ack_minutes).toFixed(2)),
    avgResolveMinutes: row.avg_resolve_minutes === null || row.avg_resolve_minutes === undefined
      ? null
      : Number(Number(row.avg_resolve_minutes).toFixed(2)),
  };
};

// Find operators with optional filter on role/status/online/assigned camera.
const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT, "created_at");

  const conditions = [];
  const params = [];

  // Operators are SECURITY_OPERATOR users by default; ADMIN can scope to a role.
  if (filters.role) {
    conditions.push("u.role = ?");
    params.push(filters.role);
  } else {
    conditions.push("u.role = 'SECURITY_OPERATOR'");
  }
  if (filters.status) {
    conditions.push("u.status = ?");
    params.push(filters.status);
  }
  if (filters.onlineStatus) {
    conditions.push("u.online_status = ?");
    params.push(filters.onlineStatus);
  }
  if (filters.cameraId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM operator_camera_assignments oca JOIN cameras c ON c.id = oca.camera_id WHERE oca.operator_id = u.id AND c.camera_code = ?)"
    );
    params.push(filters.cameraId);
  }
  if (filters.search) {
    conditions.push("(u.full_name LIKE ? OR u.email LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM users u ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT u.id, u.public_id, u.full_name, u.email, u.role, u.status,
            u.online_status, u.connected_at, u.last_seen_at, u.last_login_at, u.created_at,
            (SELECT COUNT(*) FROM operator_camera_assignments oca JOIN cameras c ON c.id=oca.camera_id
              WHERE oca.operator_id = u.id AND c.deleted_at IS NULL) AS assigned_camera_count,
            (SELECT CONCAT('[', GROUP_CONCAT(JSON_OBJECT('id', c.id, 'cameraCode', c.camera_code, 'name', c.name) SEPARATOR ','), ']')
               FROM operator_camera_assignments oca
               LEFT JOIN cameras c ON c.id = oca.camera_id
              WHERE oca.operator_id = u.id AND c.deleted_at IS NULL) AS assigned_cameras_json,
            (SELECT COUNT(*) FROM alerts a WHERE a.deleted_at IS NULL AND EXISTS
              (SELECT 1 FROM operator_camera_assignments oca WHERE oca.operator_id=u.id AND oca.camera_id=a.camera_id)) AS alerts_received,
            (SELECT COUNT(*) FROM alerts a WHERE a.deleted_at IS NULL AND a.acknowledged_by=u.id) AS alerts_acknowledged,
            (SELECT COUNT(*) FROM alerts a WHERE a.deleted_at IS NULL AND a.severity='MEDIUM' AND a.acknowledged_by=u.id) AS medium_acknowledged,
            (SELECT COUNT(*) FROM alerts a WHERE a.deleted_at IS NULL AND a.severity='HIGH' AND a.acknowledged_by=u.id) AS high_acknowledged,
            (SELECT COUNT(*) FROM audit_logs l WHERE l.user_id=u.id AND l.action='ALERT_ESCALATED') AS critical_escalated,
            (SELECT COUNT(*) FROM alerts a WHERE a.deleted_at IS NULL AND a.resolved_by=u.id) AS alerts_resolved,
            (SELECT COUNT(*) FROM alerts a WHERE a.deleted_at IS NULL AND a.status IN ('NEW','ACTIVE','ACKNOWLEDGED','INVESTIGATING') AND EXISTS
              (SELECT 1 FROM operator_camera_assignments oca WHERE oca.operator_id=u.id AND oca.camera_id=a.camera_id)) AS pending_alerts,
            (SELECT AVG(TIMESTAMPDIFF(SECOND,a.created_at,a.acknowledged_at))/60 FROM alerts a
              WHERE a.deleted_at IS NULL AND a.acknowledged_by=u.id AND a.acknowledged_at IS NOT NULL
                AND a.acknowledged_at >= a.created_at) AS avg_ack_minutes,
            (SELECT AVG(TIMESTAMPDIFF(SECOND,a.created_at,a.resolved_at))/60 FROM alerts a
              WHERE a.deleted_at IS NULL AND a.resolved_by=u.id AND a.resolved_at IS NOT NULL
                AND a.resolved_at >= a.created_at) AS avg_resolve_minutes
       FROM users u
       ${where}
       ORDER BY u.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapOperator),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findById = async (operatorId) => {
  const [rows] = await getPool().execute(
    `SELECT u.id, u.public_id, u.full_name, u.email, u.role, u.status,
            u.online_status, u.connected_at, u.last_seen_at, u.last_login_at, u.created_at
       FROM users u
      WHERE u.id = ? LIMIT 1`,
    [operatorId]
  );
  return mapOperator(rows[0] || null);
};

const updateOnlineState = async ({ userId, onlineStatus, connectedAt = null }) => {
  const conn = getPool();
  if (connectedAt) {
    await conn.execute(
      `UPDATE users
          SET online_status = ?, connected_at = ?, last_seen_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [onlineStatus, connectedAt, userId]
    );
  } else {
    await conn.execute(
      `UPDATE users
          SET online_status = ?, last_seen_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [onlineStatus, userId]
    );
  }
};

const touchLastSeen = async (userId) => {
  await getPool().execute(
    `UPDATE users SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?`,
    [userId]
  );
};

// Analytics aggregates for an operator (or all operators if operatorId is null).
const analyticsAggregates = async ({ operatorId, startDate, endDate } = {}) => {
  const conditions = ["a.deleted_at IS NULL"];
  const params = [];
  if (startDate) {
    conditions.push("a.created_at >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("(a.acknowledged_at < ? OR (a.acknowledged_at IS NULL AND a.created_at < ?))");
    params.push(endDate, endDate);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const receivedExpr = operatorId
    ? "EXISTS (SELECT 1 FROM operator_camera_assignments oca WHERE oca.operator_id = ? AND oca.camera_id = a.camera_id)"
    : "1=1";
  const actorExpr = operatorId ? "= ?" : "IS NOT NULL";
  const selectParams = operatorId ? Array(9).fill(operatorId) : [];

  const [[row]] = await getPool().execute(
    `SELECT
       SUM(${receivedExpr}) AS alerts_received,
       SUM(a.acknowledged_by ${actorExpr}) AS alerts_acknowledged,
       SUM(a.severity = 'MEDIUM' AND a.acknowledged_by ${actorExpr}) AS medium_acknowledged,
       SUM(a.severity = 'HIGH' AND a.acknowledged_by ${actorExpr}) AS high_acknowledged,
       ${operatorId
         ? "(SELECT COUNT(*) FROM audit_logs l WHERE l.user_id = ? AND l.action = 'ALERT_ESCALATED')"
         : "SUM(a.escalated = 1 AND a.severity = 'CRITICAL')"} AS critical_escalated,
       SUM(a.resolved_by ${actorExpr}) AS alerts_resolved,
       SUM(${receivedExpr} AND a.status IN ('NEW','ACTIVE','ACKNOWLEDGED','INVESTIGATING')) AS pending_alerts,
       AVG(CASE WHEN a.acknowledged_by ${actorExpr} AND a.acknowledged_at IS NOT NULL AND a.created_at IS NOT NULL
                     AND a.acknowledged_at >= a.created_at
            THEN TIMESTAMPDIFF(SECOND, a.created_at, a.acknowledged_at) / 60 END) AS avg_ack_minutes,
       AVG(CASE WHEN a.resolved_by ${actorExpr} AND a.resolved_at IS NOT NULL AND a.created_at IS NOT NULL
                     AND a.resolved_at >= a.created_at
            THEN TIMESTAMPDIFF(SECOND, a.created_at, a.resolved_at) / 60 END) AS avg_resolve_minutes
     FROM alerts a
     ${where}`,
    [...selectParams, ...params]
  );
  return {
    alertsReceived: Number(row.alerts_received || 0),
    alertsAcknowledged: Number(row.alerts_acknowledged || 0),
    mediumAcknowledged: Number(row.medium_acknowledged || 0),
    highAcknowledged: Number(row.high_acknowledged || 0),
    criticalEscalated: Number(row.critical_escalated || 0),
    alertsResolved: Number(row.alerts_resolved || 0),
    pendingAlerts: Number(row.pending_alerts || 0),
    avgAcknowledgeMinutes:
      row.avg_ack_minutes === null || row.avg_ack_minutes === undefined
        ? null
        : Number(Number(row.avg_ack_minutes).toFixed(2)),
    avgResolveMinutes:
      row.avg_resolve_minutes === null || row.avg_resolve_minutes === undefined
        ? null
        : Number(Number(row.avg_resolve_minutes).toFixed(2)),
  };
};

const listAssignedCameras = async (operatorId) => {
  const [rows] = await getPool().execute(
    `SELECT c.id, c.camera_code, c.name, c.location_name, c.sector, c.stream_status, c.ai_status, c.enabled
      FROM operator_camera_assignments oca
      JOIN cameras c ON c.id = oca.camera_id
      WHERE oca.operator_id = ? AND c.deleted_at IS NULL
      ORDER BY c.camera_code`,
    [operatorId]
  );
  return rows.map((r) => ({
    id: r.id,
    cameraCode: r.camera_code,
    name: r.name,
    locationName: r.location_name || null,
    sector: r.sector || null,
    streamStatus: r.stream_status || null,
    aiStatus: r.ai_status || null,
    enabled: Boolean(r.enabled),
  }));
};

const assignCamera = async ({ operatorId, cameraId, assignedBy }, conn) => {
  const executor = conn || getPool();
  await executor.execute(
    `INSERT INTO operator_camera_assignments (operator_id, camera_id, assigned_by)
     VALUES (?, ?, ?)`,
    [operatorId, cameraId, assignedBy || null]
  );
};

const unassignCamera = async ({ operatorId, cameraId }, conn) => {
  const executor = conn || getPool();
  await executor.execute(
    `DELETE FROM operator_camera_assignments
      WHERE operator_id = ? AND camera_id = ?`,
    [operatorId, cameraId]
  );
};

const findAssignment = async ({ operatorId, cameraId }, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT id FROM operator_camera_assignments WHERE operator_id = ? AND camera_id = ? LIMIT 1`,
    [operatorId, cameraId]
  );
  return rows[0] || null;
};

const updateOperatorStatus = async (operatorId, status, conn) => {
  await (conn || getPool()).execute("UPDATE users SET status = ? WHERE id = ?", [status, operatorId]);
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};

const commit = async (conn) => conn.commit();
const rollback = async (conn) => conn.rollback();
const release = async (conn) => conn.release();

module.exports = {
  findMany,
  findById,
  updateOnlineState,
  touchLastSeen,
  analyticsAggregates,
  listAssignedCameras,
  assignCamera,
  unassignCamera,
  findAssignment,
  updateOperatorStatus,
  beginTransaction,
  commit,
  rollback,
  release,
};
