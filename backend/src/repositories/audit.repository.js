const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const ALLOWED_SORT = ["created_at", "action", "entity_type", "user_id"];

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const mapAudit = (row) => {
  if (!row) return null;
  const { details_json, ...rest } = row;
  return { ...rest, details: parseJson(details_json) };
};

const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT);

  const conditions = [];
  const params = [];

  if (filters.userId !== undefined && filters.userId !== null && filters.userId !== "") {
    conditions.push("l.user_id = ?");
    params.push(filters.userId);
  }
  if (filters.action) {
    conditions.push("l.action = ?");
    params.push(filters.action);
  }
  if (filters.entityType) {
    conditions.push("l.entity_type = ?");
    params.push(filters.entityType);
  }
  if (filters.startDate) {
    conditions.push("l.created_at >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("l.created_at < ?");
    params.push(filters.endDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM audit_logs l ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT l.id, l.user_id, l.actor_role, l.action, l.entity_type,
            l.entity_id, l.details_json, l.ip_address,
            l.created_at,
            u.full_name AS user_name, u.email AS user_email
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${where}
       ORDER BY l.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapAudit),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findById = async (id) => {
  const [rows] = await getPool().execute(
    `SELECT l.id, l.user_id, l.actor_role, l.action, l.entity_type,
            l.entity_id, l.details_json, l.ip_address,
            l.created_at,
            u.full_name AS user_name, u.email AS user_email
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.id = ? LIMIT 1`,
    [id]
  );
  return mapAudit(rows[0] || null);
};

const count = async (conn) => {
  const [rows] = await (conn || getPool()).execute("SELECT COUNT(*) AS total FROM audit_logs");
  return Number(rows[0].total || 0);
};

// Soft-retention: truncation of the oldest audit rows beyond the configured cap.
// Returns the number of rows removed. Runs outside a transaction so it never
// interferes with the concurrent recording of new audit log lines.
const purgeOldest = async (keepCount, conn) => {
  const [result] = await (conn || getPool()).execute(
    `DELETE FROM audit_logs
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM audit_logs
           ORDER BY id DESC
           LIMIT 18446744073709551615 OFFSET ?
        ) doomed
      )`,
    [keepCount]
  );
  return result.affectedRows;
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};

const create = async ({ userId, action, entityType, entityId, details, ipAddress }, conn) => {
  const executor = conn || getPool();
  await executor.execute(
    `INSERT INTO audit_logs (user_id, actor_role, action, entity_type, entity_id, details_json, ip_address)
     VALUES (?, (SELECT role FROM users WHERE id = ?), ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      userId ?? null,
      action,
      entityType || null,
      entityId !== undefined && entityId !== null ? String(entityId) : null,
      details ? JSON.stringify(details) : null,
      ipAddress || null,
    ]
  );
};

module.exports = {
  findMany,
  findById,
  count,
  purgeOldest,
  create,
  beginTransaction,
};
