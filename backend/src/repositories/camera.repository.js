const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const SELECT_COLUMNS = `id, camera_code, name, description, location_name, sector,
  source_type, stream_protocol, stream_url, target_fps, rotation_degrees, stream_status,
  ai_status, enabled, deleted_at, last_seen_at, created_at, updated_at`;

const ALLOWED_SORT = ["created_at", "updated_at", "name", "camera_code", "last_seen_at"];

const CAMERA_STATUSES = ["ONLINE", "OFFLINE", "CONNECTING", "ERROR", "NOT_CONFIGURED", "DISABLED"];
const SOURCE_TYPES = ["MOBILE", "IP_CAMERA", "VIDEO_FILE", "OTHER"];
const STREAM_PROTOCOLS = ["RTSP", "HTTP", "HLS", "WEBRTC", "OTHER"];

const mapCamera = (row) => (row ? { ...row, enabled: Boolean(row.enabled) } : null);

const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT);

  const conditions = [];
  const params = [];

  // Soft-deleted cameras are never returned by public lists.
  conditions.push("deleted_at IS NULL");

  if (filters.status) {
    conditions.push("stream_status = ?");
    params.push(filters.status);
  }
  if (filters.sourceType) {
    conditions.push("source_type = ?");
    params.push(filters.sourceType);
  }
  if (filters.sector) {
    conditions.push("sector = ?");
    params.push(filters.sector);
  }
  if (filters.enabled !== undefined && filters.enabled !== null && filters.enabled !== "") {
    conditions.push("enabled = ?");
    params.push(filters.enabled ? 1 : 0);
  }
  if (filters.search) {
    conditions.push("(name LIKE ? OR camera_code LIKE ? OR location_name LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }
  if (filters.operatorId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM operator_camera_assignments oca WHERE oca.camera_id = cameras.id AND oca.operator_id = ?)"
    );
    params.push(filters.operatorId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM cameras ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT ${SELECT_COLUMNS} FROM cameras ${where} ORDER BY ${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapCamera),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findByCode = async (cameraCode, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT ${SELECT_COLUMNS} FROM cameras WHERE camera_code = ? LIMIT 1`,
    [cameraCode]
  );
  return mapCamera(rows[0] || null);
};

const findById = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT ${SELECT_COLUMNS} FROM cameras WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapCamera(rows[0] || null);
};

const create = async (data, conn) => {
  const [result] = await (conn || getPool()).execute(
    `INSERT INTO cameras
      (camera_code, name, description, location_name, sector, source_type,
       stream_protocol, stream_url, target_fps, rotation_degrees, stream_status,
       ai_status, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.cameraCode,
      data.name,
      data.description || null,
      data.locationName || null,
      data.sector || null,
      data.sourceType || "IP_CAMERA",
      data.streamProtocol || null,
      data.streamUrl || null,
      data.targetFps ?? null,
      data.rotationDegrees ?? 0,
      "NOT_CONFIGURED",
      "NOT_CONFIGURED",
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
    locationName: "location_name",
    sector: "sector",
    sourceType: "source_type",
    streamProtocol: "stream_protocol",
    streamUrl: "stream_url",
    targetFps: "target_fps",
    rotationDegrees: "rotation_degrees",
    streamStatus: "stream_status",
    aiStatus: "ai_status",
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
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE cameras SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  return findById(id, conn);
};

const remove = async (id) => {
  await getPool().execute("DELETE FROM cameras WHERE id = ?", [id]);
};

// Soft delete: mark the camera deleted (and disable it) so events/zones FK
// references remain intact. Deleted cameras are excluded from all lists.
const softDelete = async (id, conn) => {
  const [result] = await (conn || getPool()).execute(
    `UPDATE cameras
        SET enabled = 0, stream_status = 'DISABLED', deleted_at = UTC_TIMESTAMP()
      WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return result.affectedRows > 0;
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
  remove,
  softDelete,
  beginTransaction,
  CAMERA_STATUSES,
  SOURCE_TYPES,
  STREAM_PROTOCOLS,
};
