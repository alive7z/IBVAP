const { getPool } = require("../config/database");

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const mapEvidence = (row) => {
  if (!row) return null;
  return { ...row };
};

const findByCode = async (evidenceCode) => {
  const [rows] = await getPool().execute(
    `SELECT ev.id, ev.evidence_code, ev.evidence_type, ev.mime_type, ev.file_size_bytes,
            ev.checksum, ev.captured_at, ev.created_at,
            c.camera_code, e.event_code, al.alert_code
       FROM evidence ev
       LEFT JOIN cameras c ON c.id = ev.camera_id
       LEFT JOIN events e ON e.id = ev.event_id
       LEFT JOIN alerts al ON al.id = ev.alert_id
       WHERE ev.evidence_code = ? LIMIT 1`,
    [evidenceCode]
  );
  return mapEvidence(rows[0] || null);
};

const findById = async (id) => {
  const [rows] = await getPool().execute(
    `SELECT id, evidence_code, event_id, alert_id, camera_id, evidence_type,
            file_path, mime_type, file_size_bytes, checksum, captured_at, created_at
       FROM evidence WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapEvidence(rows[0] || null);
};

// Idempotency lookup by evidence_code (the evidenceId supplied by the AI engine).
const findByEvidenceId = async (evidenceCode) => {
  const [rows] = await getPool().execute(
    `SELECT id, evidence_code, event_id, alert_id, camera_id, evidence_type,
            file_path, mime_type, file_size_bytes, checksum, captured_at, created_at
       FROM evidence WHERE evidence_code = ? LIMIT 1`,
    [evidenceCode]
  );
  return mapEvidence(rows[0] || null);
};

const findByEventId = async (eventId) => {
  const [rows] = await getPool().execute(
    `SELECT ev.id, ev.evidence_code, ev.evidence_type, ev.mime_type, ev.file_size_bytes,
            ev.checksum, ev.captured_at, ev.created_at,
            c.camera_code, e.event_code, al.alert_code
       FROM evidence ev
       LEFT JOIN cameras c ON c.id = ev.camera_id
       LEFT JOIN events e ON e.id = ev.event_id
       LEFT JOIN alerts al ON al.id = ev.alert_id
       WHERE ev.event_id = ?`,
    [eventId]
  );
  return rows.map(mapEvidence);
};

const findByAlertId = async (alertId) => {
  const [rows] = await getPool().execute(
    `SELECT ev.id, ev.evidence_code, ev.evidence_type, ev.mime_type, ev.file_size_bytes,
            ev.checksum, ev.captured_at, ev.created_at,
            c.camera_code, e.event_code, al.alert_code
       FROM evidence ev
       LEFT JOIN cameras c ON c.id = ev.camera_id
       LEFT JOIN events e ON e.id = ev.event_id
       LEFT JOIN alerts al ON al.id = ev.alert_id
       WHERE ev.alert_id = ?`,
    [alertId]
  );
  return rows.map(mapEvidence);
};

// Insert evidence metadata (Phase 11). Media binaries live on the filesystem;
// only metadata + a storage reference are stored here.
const create = async (data) => {
  const executor = data.conn || getPool();
  const [result] = await executor.execute(
    `INSERT INTO evidence
       (evidence_code, event_id, alert_id, camera_id, evidence_type, file_path,
        mime_type, file_size_bytes, checksum, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.evidenceCode,
      data.eventId,
      data.alertId,
      data.cameraId,
      data.evidenceType,
      data.filePath, // server-local path, never returned by public API
      data.mimeType || null,
      data.fileSizeBytes || null,
      data.checksum || null,
      data.capturedAt,
    ]
  );
  return findById(result.insertId);
};

// Evidence rows whose parents (event AND alert) are all deleted or missing.
// Only orphans captured before `hours` ago are eligible, so recently produced
// evidence is never removed in a race with a soft-deleted parent.
const findOrphanedOlderThan = async (hours) => {
  const [rows] = await getPool().execute(
    `SELECT ev.id, ev.evidence_code, ev.evidence_type, ev.file_path,
            ev.event_id, ev.alert_id, ev.captured_at
       FROM evidence ev
      WHERE NOT EXISTS (
              SELECT 1 FROM alerts a
               WHERE a.id = ev.alert_id AND a.deleted_at IS NULL
            )
        AND NOT EXISTS (
              SELECT 1 FROM events e
               WHERE e.id = ev.event_id AND e.deleted_at IS NULL
            )
        AND ev.captured_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)`,
    [hours]
  );
  return rows.map(mapEvidence);
};

const deleteById = async (id) => {
  const [result] = await getPool().execute("DELETE FROM evidence WHERE id = ?", [id]);
  return result.affectedRows;
};

module.exports = {
  findByCode,
  findById,
  findByEvidenceId,
  findByEventId,
  findByAlertId,
  create,
  deleteById,
  findOrphanedOlderThan,
  parseJson,
};
