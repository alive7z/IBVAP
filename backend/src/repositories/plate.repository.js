const { getPool } = require("../config/database");

// Insert a plate detection row. `eventId` is the FK to the events row that
// carries the matching PLATE_DETECTED observation. `plateEventCode` is used as
// the business key for idempotency (same value as the event_code).
const create = async (data, conn) => {
  const executor = conn || getPool();
  const [result] = await executor.execute(
    `INSERT INTO plates
       (plate_event_code, event_id, camera_id, vehicle_track_id,
        plate_text, ocr_confidence, vehicle_type, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.plateEventCode,
      data.eventId,
      data.cameraId || null,
      data.vehicleTrackId !== undefined && data.vehicleTrackId !== null
        ? String(data.vehicleTrackId)
        : null,
      data.plateText,
      data.ocrConfidence,
      data.vehicleType || null,
      data.capturedAt,
    ]
  );
  return result.insertId;
};

const findByPlateEventCode = async (plateEventCode) => {
  const [rows] = await getPool().execute(
    "SELECT * FROM plates WHERE plate_event_code = ? LIMIT 1",
    [plateEventCode]
  );
  return rows[0] || null;
};

const findByEventId = async (eventId) => {
  const [rows] = await getPool().execute(
    "SELECT * FROM plates WHERE event_id = ? LIMIT 1",
    [eventId]
  );
  return rows[0] || null;
};

module.exports = { create, findByPlateEventCode, findByEventId };
