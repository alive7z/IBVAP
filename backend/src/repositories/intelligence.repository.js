const { getPool } = require("../config/database");
const { parsePagination, parseSort } = require("../utils/pagination");

const ALLOWED_SORT = ["captured_at", "created_at", "ocr_confidence", "plate_text"];
const EVENT_ALLOWED_SORT = ["occurred_at", "created_at", "confidence"];

const mapPlate = (row) => {
  if (!row) return null;
  return {
    ...row,
    ocr_confidence: row.ocr_confidence === null ? null : Number(row.ocr_confidence),
    confidence_percent: row.ocr_confidence === null ? null : Math.round(Number(row.ocr_confidence) * 100),
  };
};

const findPlates = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT);

  const conditions = [];
  const params = [];

  if (filters.plateText) {
    conditions.push("p.plate_text LIKE ?");
    params.push(`%${filters.plateText}%`);
  }
  if (filters.cameraId) {
    conditions.push("p.camera_id = (SELECT id FROM cameras WHERE camera_code = ?)");
    params.push(filters.cameraId);
  }
  if (filters.vehicleType) {
    if (String(filters.vehicleType).toUpperCase() === "OTHER") {
      conditions.push("UPPER(COALESCE(p.vehicle_type, 'VEHICLE')) NOT IN ('CAR','TRUCK','BUS','MOTORCYCLE','BICYCLE')");
    } else {
      conditions.push("UPPER(p.vehicle_type) = ?");
      params.push(String(filters.vehicleType).toUpperCase());
    }
  }
  if (filters.minConfidence !== undefined && filters.minConfidence !== null && filters.minConfidence !== "") {
    conditions.push("p.ocr_confidence >= ?");
    params.push(filters.minConfidence);
  }
  if (filters.maxConfidence !== undefined && filters.maxConfidence !== null && filters.maxConfidence !== "") {
    conditions.push("p.ocr_confidence < ?");
    params.push(filters.maxConfidence);
  }
  if (filters.startDate) {
    conditions.push("p.captured_at >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("p.captured_at < ?");
    params.push(filters.endDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM plates p ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT p.plate_event_code, p.plate_text,
            p.ocr_confidence, p.vehicle_type,
            p.vehicle_track_id, p.captured_at,
            c.camera_code, c.name AS camera_name, c.location_name,
            e.event_code,
            JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.rawText')) AS raw_text,
            JSON_EXTRACT(e.context_json, '$.plateBBox') AS plate_bbox
       FROM plates p
       LEFT JOIN cameras c ON c.id = p.camera_id
       LEFT JOIN events e ON e.id = p.event_id
       ${where}
       ORDER BY p.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapPlate),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const buildEventFilters = (filters, eventType, { includePlateSearch = false, includeVehicleType = false } = {}) => {
  const conditions = ["e.event_type = ?", "e.deleted_at IS NULL"];
  const params = [eventType];
  if (filters.cameraId) {
    conditions.push("c.camera_code = ?");
    params.push(filters.cameraId);
  }
  if (filters.sector) {
    conditions.push("c.sector = ?");
    params.push(filters.sector);
  }
  if (filters.minConfidence !== undefined && filters.minConfidence !== null && filters.minConfidence !== "") {
    conditions.push("e.confidence >= ?");
    params.push(filters.minConfidence);
  }
  if (filters.maxConfidence !== undefined && filters.maxConfidence !== null && filters.maxConfidence !== "") {
    conditions.push("e.confidence < ?");
    params.push(filters.maxConfidence);
  }
  if (filters.startDate) {
    conditions.push("e.occurred_at >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("e.occurred_at < ?");
    params.push(filters.endDate);
  }
  if (filters.search) {
    const like = `%${filters.search}%`;
    const plateSql = includePlateSearch
      ? ` OR EXISTS (
            SELECT 1 FROM plates ps
            JOIN events pse ON pse.id = ps.event_id
             WHERE ps.camera_id = e.camera_id
               AND ps.vehicle_track_id = e.track_id
               AND JSON_UNQUOTE(JSON_EXTRACT(pse.context_json, '$.streamSessionId')) =
                   JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.streamSessionId'))
               AND ps.plate_text LIKE ?
          )`
      : "";
    conditions.push(`(e.event_code LIKE ? OR e.track_id LIKE ? OR c.camera_code LIKE ? OR c.name LIKE ?${plateSql})`);
    params.push(like, like, like, like);
    if (includePlateSearch) params.push(like);
  }
  if (includeVehicleType && filters.vehicleType) {
    if (String(filters.vehicleType).toUpperCase() === "OTHER") {
      conditions.push("UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.vehicleType')), 'VEHICLE')) NOT IN ('CAR','TRUCK','BUS','MOTORCYCLE','BICYCLE')");
    } else {
      conditions.push("UPPER(JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.vehicleType'))) = ?");
      params.push(String(filters.vehicleType).toUpperCase());
    }
  }
  return { where: `WHERE ${conditions.join(" AND ")}`, params };
};

const findFaces = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, EVENT_ALLOWED_SORT, "occurred_at");
  const { where, params } = buildEventFilters(filters, "FACE_DETECTED");
  const [[countRow]] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM events e LEFT JOIN cameras c ON c.id = e.camera_id ${where}`,
    params
  );
  const [rows] = await getPool().execute(
    `SELECT e.event_code, e.track_id, e.confidence, e.context_json, e.occurred_at,
            c.camera_code, c.name AS camera_name, c.location_name, c.sector,
            (SELECT ev.evidence_code FROM evidence ev
              WHERE ev.event_id = e.id AND ev.evidence_type = 'FACE'
              ORDER BY ev.id LIMIT 1) AS evidence_code
       FROM events e
       LEFT JOIN cameras c ON c.id = e.camera_id
       ${where}
       ORDER BY e.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = Number(countRow.total || 0);
  return {
    items: rows.map((row) => ({ ...row, confidence: row.confidence === null ? null : Number(row.confidence) })),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findVehicles = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, EVENT_ALLOWED_SORT, "occurred_at");
  const { where, params } = buildEventFilters(filters, "VEHICLE_DETECTED", {
    includePlateSearch: true,
    includeVehicleType: true,
  });
  const [[countRow]] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM events e LEFT JOIN cameras c ON c.id = e.camera_id ${where}`,
    params
  );
  const [rows] = await getPool().execute(
    `SELECT e.event_code, e.track_id, e.confidence, e.context_json, e.occurred_at,
            c.camera_code, c.name AS camera_name, c.location_name,
            (SELECT p.plate_text FROM plates p
              JOIN events pe ON pe.id = p.event_id
             WHERE p.camera_id = e.camera_id AND p.vehicle_track_id = e.track_id
               AND JSON_UNQUOTE(JSON_EXTRACT(pe.context_json, '$.streamSessionId')) =
                   JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.streamSessionId'))
             ORDER BY p.captured_at DESC LIMIT 1) AS plate_text
       FROM events e
       LEFT JOIN cameras c ON c.id = e.camera_id
       ${where}
       ORDER BY e.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = Number(countRow.total || 0);
  return {
    items: rows.map((row) => ({ ...row, confidence: row.confidence === null ? null : Number(row.confidence) })),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const getSummary = async ({ startDate, endDate }) => {
  const [[events]] = await getPool().execute(
    `SELECT
       SUM(event_type = 'FACE_DETECTED' AND occurred_at >= ? AND occurred_at < ? AND deleted_at IS NULL) AS face_today,
       SUM(event_type = 'VEHICLE_DETECTED' AND occurred_at >= ? AND occurred_at < ? AND deleted_at IS NULL) AS vehicle_today
     FROM events`,
    [startDate, endDate, startDate, endDate]
  );
  const [[plates]] = await getPool().execute(
    "SELECT COUNT(*) AS anpr_today FROM plates WHERE captured_at >= ? AND captured_at < ?",
    [startDate, endDate]
  );
  const [[cameras]] = await getPool().execute(
    "SELECT COUNT(*) AS active_cameras FROM cameras WHERE enabled = 1 AND deleted_at IS NULL"
  );
  const [cameraRows] = await getPool().execute(
    "SELECT camera_code FROM cameras WHERE deleted_at IS NULL ORDER BY camera_code"
  );
  return {
    anprToday: Number(plates.anpr_today || 0),
    faceDetectionsToday: Number(events.face_today || 0),
    vehicleEventsToday: Number(events.vehicle_today || 0),
    activeCameras: Number(cameras.active_cameras || 0),
    cameras: cameraRows.map((row) => row.camera_code),
    timezone: "Asia/Kolkata",
    startDate,
    endDate,
  };
};

const findByPlateEventCode = async (plateEventCode) => {
  const [rows] = await getPool().execute(
    `SELECT p.plate_event_code, p.plate_text,
            p.ocr_confidence, p.vehicle_type,
            p.vehicle_track_id, p.captured_at,
            c.camera_code, c.name AS camera_name, c.location_name,
            e.event_code,
            JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.rawText')) AS raw_text,
            JSON_EXTRACT(e.context_json, '$.plateBBox') AS plate_bbox
       FROM plates p
       LEFT JOIN cameras c ON c.id = p.camera_id
       LEFT JOIN events e ON e.id = p.event_id
       WHERE p.plate_event_code = ? LIMIT 1`,
    [plateEventCode]
  );
  return mapPlate(rows[0] || null);
};

module.exports = {
  findPlates,
  findByPlateEventCode,
  findFaces,
  findVehicles,
  getSummary,
};
