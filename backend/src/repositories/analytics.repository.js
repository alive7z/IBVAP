const { getPool } = require("../config/database");

const todayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

const overview = async () => {
  const [[cameras]] = await getPool().execute(
    `SELECT COUNT(*) AS total,
            SUM(stream_status = 'ONLINE') AS online,
            SUM(stream_status != 'ONLINE') AS offline
       FROM cameras WHERE deleted_at IS NULL`
  );

  const [[events]] = await getPool().execute(
    `SELECT COUNT(*) AS total,
            SUM(occurred_at >= ?) AS today,
            SUM(occurred_at >= ? AND severity IN ('HIGH','CRITICAL')) AS high_risk_today
       FROM events WHERE deleted_at IS NULL`,
    [todayStart(), todayStart()]
  );

  const [[alerts]] = await getPool().execute(
    `SELECT SUM(status IN ('NEW','ACTIVE')) AS active,
            SUM(severity = 'CRITICAL' AND status IN ('NEW','ACTIVE')) AS critical,
            SUM(status = 'ACKNOWLEDGED') AS acknowledged,
            SUM(status = 'RESOLVED') AS resolved
       FROM alerts WHERE deleted_at IS NULL`
  );

  return {
    cameras: {
      total: Number(cameras.total),
      online: Number(cameras.online),
      offline: Number(cameras.offline),
    },
    events: {
      total: Number(events.total),
      today: Number(events.today),
      highRiskToday: Number(events.high_risk_today),
    },
    alerts: {
      active: Number(alerts.active),
      critical: Number(alerts.critical),
      acknowledged: Number(alerts.acknowledged),
      resolved: Number(alerts.resolved),
    },
  };
};

const eventsBySeverity = async () => {
  const [rows] = await getPool().execute(
    `SELECT severity, COUNT(*) AS count FROM events WHERE deleted_at IS NULL GROUP BY severity ORDER BY severity`
  );
  return rows.map((r) => ({ severity: r.severity, count: Number(r.count) }));
};

const eventsByType = async () => {
  const [rows] = await getPool().execute(
    `SELECT event_type, COUNT(*) AS count FROM events WHERE deleted_at IS NULL GROUP BY event_type ORDER BY count DESC`
  );
  return rows.map((r) => ({ event_type: r.event_type, count: Number(r.count) }));
};

const eventsOverTime = async ({ startDate, endDate } = {}) => {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (startDate) {
    conditions.push("occurred_at >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("occurred_at < ?");
    params.push(endDate);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await getPool().execute(
    `SELECT DATE(occurred_at) AS date, COUNT(*) AS count
       FROM events ${where}
      GROUP BY DATE(occurred_at) ORDER BY date ASC`,
    params
  );
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
};

const eventsByCamera = async (limit = 10) => {
  const [rows] = await getPool().execute(
    `SELECT c.camera_code, c.name AS camera_name, COUNT(e.id) AS count
       FROM events e
       JOIN cameras c ON c.id = e.camera_id
      WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL
      GROUP BY c.id, c.camera_code, c.name
      ORDER BY count DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ camera_code: r.camera_code, camera_name: r.camera_name, count: Number(r.count) }));
};

const eventsByHour = async () => {
  const [rows] = await getPool().execute(
    `SELECT HOUR(occurred_at) AS hour, COUNT(*) AS count
       FROM events WHERE deleted_at IS NULL
      GROUP BY HOUR(occurred_at) ORDER BY hour ASC`
  );
  return rows.map((r) => ({ hour: Number(r.hour), count: Number(r.count) }));
};

const alertsBySeverity = async () => {
  const [rows] = await getPool().execute(
    `SELECT severity, COUNT(*) AS count FROM alerts WHERE deleted_at IS NULL GROUP BY severity ORDER BY severity`
  );
  return rows.map((r) => ({ severity: r.severity, count: Number(r.count) }));
};

const alertsByStatus = async () => {
  const [rows] = await getPool().execute(
    `SELECT status, COUNT(*) AS count FROM alerts WHERE deleted_at IS NULL GROUP BY status ORDER BY status`
  );
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
};

const alertsOverTime = async ({ startDate, endDate } = {}) => {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (startDate) {
    conditions.push("created_at >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("created_at < ?");
    params.push(endDate);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await getPool().execute(
    `SELECT DATE(created_at) AS date, severity, COUNT(*) AS count
       FROM alerts ${where}
      GROUP BY DATE(created_at), severity ORDER BY date ASC, severity ASC`,
    params
  );
  return rows.map((r) => ({ date: r.date, severity: r.severity, count: Number(r.count) }));
};

const averageRiskScore = async ({ startDate, endDate } = {}) => {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (startDate) {
    conditions.push("created_at >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("created_at < ?");
    params.push(endDate);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [[row]] = await getPool().execute(
    `SELECT AVG(risk_score) AS average_risk_score, COUNT(*) AS count
       FROM alerts ${where}`,
    params
  );
  return {
    average_risk_score: row.average_risk_score === null ? null : Number(row.average_risk_score),
    count: Number(row.count),
  };
};

const camerasByStatus = async () => {
  const [rows] = await getPool().execute(
    `SELECT stream_status AS status, COUNT(*) AS count FROM cameras WHERE deleted_at IS NULL GROUP BY stream_status ORDER BY status`
  );
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
};

const camerasBySector = async () => {
  const [rows] = await getPool().execute(
    `SELECT sector, COUNT(*) AS count FROM cameras WHERE deleted_at IS NULL AND sector IS NOT NULL GROUP BY sector ORDER BY sector`
  );
  return rows.map((r) => ({ sector: r.sector, count: Number(r.count) }));
};

const alertCountPerCamera = async (limit = 10) => {
  const [rows] = await getPool().execute(
    `SELECT c.camera_code, c.name AS camera_name, COUNT(a.id) AS count
       FROM alerts a
       JOIN cameras c ON c.id = a.camera_id
      WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL
      GROUP BY c.id, c.camera_code, c.name
      ORDER BY count DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ camera_code: r.camera_code, camera_name: r.camera_name, count: Number(r.count) }));
};

// Operator response-time analytics: acknowledge/resolve latency plus workload.
// Only counts alerts with a non-null lifecycle timestamp (excludes rows where an
// operator was never involved).
const responseTimeAnalytics = async () => {
  const [[row]] = await getPool().execute(
    `SELECT
       COUNT(*) AS acknowledged_total,
       AVG(CASE WHEN a.acknowledged_at IS NOT NULL AND a.created_at IS NOT NULL
                     AND a.acknowledged_at >= a.created_at
            THEN TIMESTAMPDIFF(SECOND, a.created_at, a.acknowledged_at) END) AS avg_ack_seconds,
       AVG(CASE WHEN a.resolved_at IS NOT NULL AND a.created_at IS NOT NULL
                     AND a.resolved_at >= a.created_at
            THEN TIMESTAMPDIFF(SECOND, a.created_at, a.resolved_at) END) AS avg_resolve_seconds
     FROM alerts a
     WHERE a.deleted_at IS NULL
       AND a.status IN ('ACKNOWLEDGED','INVESTIGATING','RESOLVED','FALSE_POSITIVE')`
  );
  return {
    acknowledgedTotal: Number(row.acknowledged_total || 0),
    avgAcknowledgeSeconds:
      row.avg_ack_seconds === null || row.avg_ack_seconds === undefined
        ? null
        : Number(Number(row.avg_ack_seconds).toFixed(1)),
    avgResolveSeconds:
      row.avg_resolve_seconds === null || row.avg_resolve_seconds === undefined
        ? null
        : Number(Number(row.avg_resolve_seconds).toFixed(1)),
  };
};

// Per-operator workload distribution (acknowledged + resolved counts).
const operatorWorkload = async (limit = 10) => {
  const [rows] = await getPool().execute(
    `SELECT u.id, u.public_id, u.full_name,
            SUM(a.acknowledged_by = u.id) AS acknowledged_count,
            SUM(a.resolved_by = u.id) AS resolved_count,
            AVG(CASE WHEN a.acknowledged_by = u.id AND a.acknowledged_at IS NOT NULL AND a.created_at IS NOT NULL
                          AND a.acknowledged_at >= a.created_at
                 THEN TIMESTAMPDIFF(SECOND, a.created_at, a.acknowledged_at) END) AS avg_ack_seconds
       FROM users u
       LEFT JOIN alerts a ON (a.acknowledged_by = u.id OR a.resolved_by = u.id)
        AND a.deleted_at IS NULL
      WHERE u.role = 'SECURITY_OPERATOR'
      GROUP BY u.id, u.public_id, u.full_name
      HAVING acknowledged_count > 0 OR resolved_count > 0
      ORDER BY (acknowledged_count + resolved_count) DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    publicId: r.public_id,
    fullName: r.full_name,
    acknowledgedCount: Number(r.acknowledged_count || 0),
    resolvedCount: Number(r.resolved_count || 0),
    avgAcknowledgeSeconds:
      r.avg_ack_seconds === null || r.avg_ack_seconds === undefined
        ? null
        : Number(Number(r.avg_ack_seconds).toFixed(1)),
  }));
};

module.exports = {
  overview,
  eventsBySeverity,
  eventsByType,
  eventsOverTime,
  eventsByCamera,
  eventsByHour,
  alertsBySeverity,
  alertsByStatus,
  alertsOverTime,
  averageRiskScore,
  camerasByStatus,
  camerasBySector,
  alertCountPerCamera,
  responseTimeAnalytics,
  operatorWorkload,
};
