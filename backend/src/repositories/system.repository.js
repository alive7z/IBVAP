const { getPool } = require("../config/database");

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const getLatestByComponent = async () => {
  const [rows] = await getPool().execute(
    `SELECT sh.id, sh.component, sh.status, sh.message, sh.metric_json, sh.recorded_at
       FROM system_health sh
       JOIN (
         SELECT component, MAX(recorded_at) AS max_recorded
         FROM system_health GROUP BY component
       ) latest ON latest.component = sh.component AND latest.max_recorded = sh.recorded_at`
  );
  return rows.map((r) => ({
    component: r.component,
    status: r.status,
    message: r.message,
    metric: parseJson(r.metric_json),
    recordedAt: r.recorded_at,
  }));
};

const cameraStatusSummary = async () => {
  const [[row]] = await getPool().execute(
    `SELECT
        SUM(stream_status = 'ONLINE') AS online,
        SUM(stream_status = 'OFFLINE') AS offline,
        SUM(stream_status = 'ERROR') AS error,
        SUM(stream_status = 'CONNECTING') AS connecting,
        SUM(stream_status = 'NOT_CONFIGURED') AS notConfigured,
        SUM(stream_status = 'DISABLED') AS disabled,
        SUM(enabled = 1) AS enabled,
        COUNT(*) AS total
       FROM cameras WHERE deleted_at IS NULL`
  );
  return {
    total: Number(row.total),
    enabled: Number(row.enabled),
    online: Number(row.online),
    offline: Number(row.offline),
    error: Number(row.error),
    connecting: Number(row.connecting),
    notConfigured: Number(row.notConfigured),
    disabled: Number(row.disabled),
  };
};

module.exports = { getLatestByComponent, cameraStatusSummary };
