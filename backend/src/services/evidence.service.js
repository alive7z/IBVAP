const path = require("path");
const fs = require("fs");
const evidenceRepository = require("../repositories/evidence.repository");
const eventRepository = require("../repositories/event.repository");
const alertRepository = require("../repositories/alert.repository");
const cameraRepository = require("../repositories/camera.repository");
const ApiError = require("../utils/ApiError");
const { assertRequired, assertOneOf } = require("../utils/validation");

// Evidence binaries live on the shared local filesystem under the repo's
// storage/ directory. file_path in MySQL is a server-local, validation-confined
// relative path (storage/snapshots/<id>.jpg / storage/clips/<id>.mp4). Files
// are only ever streamed through this authenticated endpoint, never exposed via
// any public static route.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const EVIDENCE_TYPES = ["SNAPSHOT", "INCIDENT_CLIP", "FACE"];
// Alert-anchored types must carry + be validated against an alertId.
// FACE evidence is event-anchored (attached to the FACE_DETECTED event).
const ALERT_ANCHORED_TYPES = new Set(["SNAPSHOT", "INCIDENT_CLIP"]);

const toSafeEvidence = (evidence) => {
  if (!evidence) return null;
  const {
    file_path: _filePath,
    event_id: _eid,
    alert_id: _aid,
    camera_id: _cid,
    id: _id,
    ...safe
  } = evidence;
  return safe;
};

// Validate + persist evidence metadata reported by the AI engine for a
// qualifying alert. Python never writes to MySQL; it only reports metadata.
// Evidence capture failure must never cancel the underlying alert — this
// endpoint is best-effort and independently idempotent by evidenceId.
const ingestEvidence = async ({ schemaVersion, cameraCode, evidence }) => {
  if (schemaVersion !== 1) {
    throw new ApiError(400, "Unsupported schemaVersion");
  }
  assertRequired(cameraCode, "cameraCode is required");
  assertRequired(evidence, "evidence is required");
  if (!Array.isArray(evidence)) {
    throw new ApiError(400, "evidence must be an array");
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera || camera.deleted_at) {
    throw new ApiError(404, "Camera not found");
  }
  if (!camera.enabled) {
    throw new ApiError(400, "Camera is disabled");
  }

  const created = [];
  let newCount = 0;

  for (const it of evidence) {
    assertRequired(it.evidenceId, "evidence.evidenceId is required");
    assertRequired(it.type, "evidence.type is required");
    assertOneOf(it.type, EVIDENCE_TYPES, "type");
    assertRequired(it.storageReference, "evidence.storageReference is required");

    // Confine storage references to server-local relative paths so the stored
    // file_path can never escape the storage root (no `../`, absolute paths,
    // backslashes, or URL/scheme references).
    const storageRef = it.storageReference;
    if (
      typeof storageRef !== "string" ||
      storageRef.trim() === "" ||
      storageRef.includes("..") ||
      storageRef.startsWith("/") ||
      storageRef.startsWith("\\") ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(storageRef)
    ) {
      throw new ApiError(400, "evidence.storageReference must be a relative file path");
    }

    let event = null;
    let alert = null;
    let alertId = null;
    let eventId = null;

    if (ALERT_ANCHORED_TYPES.has(it.type)) {
      // Alert-anchored evidence must reference a real, camera-matching alert.
      assertRequired(it.alertId, "evidence.alertId is required");
      alert = await alertRepository.findById(it.alertId);
      if (!alert) {
        throw new ApiError(404, "Alert not found for evidence.alertId");
      }
      if (alert.camera_id !== camera.id) {
        throw new ApiError(400, "Evidence camera does not match alert camera");
      }
      alertId = alert.id;
      eventId = alert.event_id;
    } else {
      // FACE evidence is event-anchored: it must reference a real FACE_DETECTED
      // event on the same camera via its eventCode.
      assertRequired(it.eventId, "evidence.eventId is required for FACE evidence");
      event = await eventRepository.findByCode(it.eventId);
      if (!event) {
        throw new ApiError(404, "Event not found for evidence.eventId");
      }
      if (event.event_type !== "FACE_DETECTED") {
        throw new ApiError(400, "FACE evidence must reference a FACE_DETECTED event");
      }
      if (event.camera_id !== camera.id) {
        throw new ApiError(400, "Evidence camera does not match event camera");
      }
      eventId = event.id;
    }

    // Idempotency by evidenceId (stored as the unique evidence_code).
    const existing = await evidenceRepository.findByEvidenceId(it.evidenceId);
    if (existing) {
      created.push(toSafeEvidence(existing));
      continue;
    }

    const fileSize = it.fileSizeBytes !== undefined && it.fileSizeBytes !== null && Number(it.fileSizeBytes) >= 0
      ? Number(it.fileSizeBytes)
      : null;

    const evidenceRow = await evidenceRepository.create({
      evidenceCode: it.evidenceId,
      eventId,
      alertId,
      cameraId: camera.id,
      evidenceType: it.type,
      filePath: storageRef, // server-local storage reference
      mimeType: it.mimeType || null,
      fileSizeBytes: fileSize,
      checksum: it.checksum || null,
      capturedAt: it.capturedAt
        ? new Date(it.capturedAt).toISOString().slice(0, 19).replace("T", " ")
        : new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    created.push(toSafeEvidence(evidenceRow));
    newCount += 1;
  }

  // evidenceCreated counts only newly-inserted rows. Deduplicated lookups stay
  // in `evidence` (so callers can confirm the alert was already captured) but
  // are reported as 0 new items.
  return { evidenceCreated: newCount, evidence: created };
};

const getEvidence = async (evidenceId) => {
  const evidence = await evidenceRepository.findByCode(evidenceId);
  if (!evidence) {
    throw new ApiError(404, "Evidence not found");
  }
  return toSafeEvidence(evidence);
};

const getEvidenceByEvent = async (eventId) => {
  const event = await eventRepository.findByCode(eventId);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  const items = await evidenceRepository.findByEventId(event.id);
  return items.map(toSafeEvidence);
};

const getEvidenceByAlert = async (alertId) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }
  const items = await evidenceRepository.findByAlertId(alert.id);
  return items.map(toSafeEvidence);
};

// Resolve the evidence metadata + confined absolute path for the stored file.
// The relative file_path is trusted only because creation validated it (no
// "..", absolute paths, backslashes, or schemes); this re-checks confinement
// against the repo root before touching the filesystem.
const getEvidenceFile = async (evidenceId) => {
  const evidence = await evidenceRepository.findByEvidenceId(evidenceId);
  if (!evidence || !evidence.file_path) {
    throw new ApiError(404, "Evidence file not found");
  }
  const absolute = path.resolve(REPO_ROOT, evidence.file_path);
  const relative = path.relative(REPO_ROOT, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ApiError(400, "Evidence file path is invalid");
  }
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch (err) {
    throw new ApiError(404, "Evidence file not found on disk");
  }
  if (!stat.isFile()) {
    throw new ApiError(400, "Evidence file path is not a file");
  }
  return {
    evidence,
    absolute,
    mimeType: evidence.mime_type || "application/octet-stream",
    size: stat.size,
  };
};

module.exports = {
  getEvidence,
  getEvidenceByEvent,
  getEvidenceByAlert,
  getEvidenceFile,
  ingestEvidence,
  toSafeEvidence,
  EVIDENCE_TYPES,
};
