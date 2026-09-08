const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const SELECT_COLUMNS = `z.id, z.zone_code, z.camera_id, c.camera_code, z.name,
  z.zone_type, z.risk_level, z.coordinates_json, z.enabled, z.created_at, z.updated_at`;

const ALLOWED_SORT = ["created_at", "updated_at", "name", "zone_code", "risk_level"];

const ZONE_TYPES = ["RESTRICTED", "MONITORING", "VIRTUAL_FENCE"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const mapZone = (row) => {
  if (!row) return null;
  let coordinates = row.coordinates_json;
  if (typeof coordinates === "string") {
    try {
      coordinates = JSON.parse(coordinates);
    } catch (err) {
      coordinates = null;
    }
  }
  return {
    ...row,
    enabled: Boolean(row.enabled),
    coordinates,
  };
};

const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT);

  const conditions = [];
  const params = [];

  if (filters.cameraId) {
    conditions.push("z.camera_id = ?");
    params.push(filters.cameraId);
  }
  if (filters.cameraCode) {
    conditions.push("z.camera_id = (SELECT id FROM cameras WHERE camera_code = ?)");
    params.push(filters.cameraCode);
  }
  if (filters.zoneType) {
    conditions.push("z.zone_type = ?");
    params.push(filters.zoneType);
  }
  if (filters.riskLevel) {
    conditions.push("z.risk_level = ?");
    params.push(filters.riskLevel);
  }
  if (filters.enabled !== undefined && filters.enabled !== null && filters.enabled !== "") {
    conditions.push("z.enabled = ?");
    params.push(filters.enabled ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM zones z ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT ${SELECT_COLUMNS}
       FROM zones z
       LEFT JOIN cameras c ON c.id = z.camera_id
       ${where} ORDER BY z.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapZone),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findByCode = async (zoneCode) => {
  const [rows] = await getPool().execute(
    `SELECT ${SELECT_COLUMNS}
       FROM zones z LEFT JOIN cameras c ON c.id = z.camera_id
      WHERE z.zone_code = ? LIMIT 1`,
    [zoneCode]
  );
  return mapZone(rows[0] || null);
};

const findById = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT ${SELECT_COLUMNS}
       FROM zones z LEFT JOIN cameras c ON c.id = z.camera_id
      WHERE z.id = ? LIMIT 1`,
    [id]
  );
  return mapZone(rows[0] || null);
};

const findManyByCameraId = async (cameraId) => {
  const [rows] = await getPool().execute(
    `SELECT ${SELECT_COLUMNS}
       FROM zones z LEFT JOIN cameras c ON c.id = z.camera_id
      WHERE z.camera_id = ?`,
    [cameraId]
  );
  return rows.map(mapZone);
};

const create = async (data, conn) => {
  const [result] = await (conn || getPool()).execute(
    `INSERT INTO zones (zone_code, camera_id, name, zone_type, risk_level, coordinates_json, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.zoneCode,
      data.cameraId,
      data.name,
      data.zoneType || "MONITORING",
      data.riskLevel || "LOW",
      JSON.stringify(data.coordinates),
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
    zoneType: "zone_type",
    riskLevel: "risk_level",
    coordinates: "coordinates_json",
    enabled: "enabled",
  };

  Object.entries(columnMap).forEach(([key, column]) => {
    if (data[key] !== undefined) {
      fields.push(`${column} = ?`);
      let value = data[key];
      if (key === "coordinates") {
        value = JSON.stringify(data[key]);
      }
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
    `UPDATE zones SET ${fields.join(", ")} WHERE id = ?`,
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
  findManyByCameraId,
  create,
  update,
  beginTransaction,
  ZONE_TYPES,
  RISK_LEVELS,
};
