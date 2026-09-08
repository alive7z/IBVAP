const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const ALLOWED_SORT = ["created_at", "updated_at", "weight", "name", "rule_code", "category"];

const SELECT_COLUMNS = `id, rule_code, name, description, category, weight,
  minimum_duration_ms, confidence_threshold,
  cooldown_seconds, enabled, created_at, updated_at`;

const mapRule = (row) => {
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    weight: row.weight === null ? null : Number(row.weight),
    confidence_threshold: row.confidence_threshold === null ? null : Number(row.confidence_threshold),
  };
};

const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT);

  const conditions = [];
  const params = [];

  if (filters.category) {
    conditions.push("category = ?");
    params.push(filters.category);
  }
  if (filters.enabled !== undefined && filters.enabled !== null && filters.enabled !== "") {
    conditions.push("enabled = ?");
    params.push(filters.enabled ? 1 : 0);
  }
  if (filters.search) {
    conditions.push("(name LIKE ? OR rule_code LIKE ? OR category LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM risk_rules ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT ${SELECT_COLUMNS} FROM risk_rules ${where} ORDER BY ${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapRule),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findByCode = async (ruleCode) => {
  const [rows] = await getPool().execute(
    `SELECT ${SELECT_COLUMNS} FROM risk_rules WHERE rule_code = ? LIMIT 1`,
    [ruleCode]
  );
  return mapRule(rows[0] || null);
};

const findById = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT ${SELECT_COLUMNS} FROM risk_rules WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapRule(rows[0] || null);
};

const create = async (data, conn) => {
  const [result] = await (conn || getPool()).execute(
    `INSERT INTO risk_rules
       (rule_code, name, description, category, weight, minimum_duration_ms,
        confidence_threshold, cooldown_seconds, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.ruleCode,
      data.name,
      data.description || null,
      data.category || null,
      data.weight === undefined ? 1.0 : data.weight,
      data.minimumDurationMs === undefined ? 0 : data.minimumDurationMs,
      data.confidenceThreshold === undefined ? 0.5 : data.confidenceThreshold,
      data.cooldownSeconds === undefined ? 0 : data.cooldownSeconds,
      data.enabled === undefined ? 1 : data.enabled ? 1 : 0,
    ]
  );
  return findById(result.insertId, conn);
};

const update = async (id, data, conn) => {
  const fields = [];
  const params = [];

  const columnMap = {
    name: "name",
    description: "description",
    category: "category",
    weight: "weight",
    minimumDurationMs: "minimum_duration_ms",
    confidenceThreshold: "confidence_threshold",
    cooldownSeconds: "cooldown_seconds",
    enabled: "enabled",
  };

  Object.entries(columnMap).forEach(([key, column]) => {
    if (data[key] !== undefined) {
      fields.push(`${column} = ?`);
      let value = data[key];
      if (key === "enabled") {
        value = data[key] ? 1 : 0;
      }
      params.push(value);
    }
  });

  if (fields.length === 0) {
    return findById(id, conn);
  }

  params.push(id);
  await (conn || getPool()).execute(
    `UPDATE risk_rules SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  return findById(id, conn);
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};

module.exports = {
  findMany,
  findByCode,
  findById,
  create,
  update,
  beginTransaction,
};
