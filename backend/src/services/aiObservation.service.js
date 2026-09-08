const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { assertRequired } = require("../utils/validation");
const cameraRepository = require("../repositories/camera.repository");
const eventRepository = require("../repositories/event.repository");
const realtimeService = require("../realtime/realtime.service");
const { toSafeEvent } = require("./event.service");

const EVENT_TYPES = ["PERSON_DETECTED", "VEHICLE_DETECTED"];
const OBJECT_TYPES = ["PERSON", "VEHICLE"];

// Validate a single observation object. Throws 400 on malformed fields.
const validateObservation = (obs) => {
  assertRequired(obs.trackId, "observation.trackId is required");
  assertRequired(obs.eventType, "observation.eventType is required");
  if (!EVENT_TYPES.includes(obs.eventType)) {
    throw new ApiError(400, `Invalid eventType: must be one of ${EVENT_TYPES.join(", ")}`);
  }
  assertRequired(obs.objectType, "observation.objectType is required");
  if (!OBJECT_TYPES.includes(obs.objectType)) {
    throw new ApiError(400, `Invalid objectType: must be one of ${OBJECT_TYPES.join(", ")}`);
  }
  assertRequired(obs.confidence, "observation.confidence is required");
  if (typeof obs.confidence !== "number" || obs.confidence < 0 || obs.confidence > 1) {
    throw new ApiError(400, "observation.confidence must be a number between 0 and 1");
  }
  assertRequired(obs.occurredAt, "observation.occurredAt is required");

  const { bbox } = obs;
  if (!bbox || typeof bbox !== "object") {
    throw new ApiError(400, "observation.bbox is required");
  }
  const { x1, y1, x2, y2 } = bbox;
  if (
    typeof x1 !== "number" ||
    typeof y1 !== "number" ||
    typeof x2 !== "number" ||
    typeof y2 !== "number"
  ) {
    throw new ApiError(400, "observation.bbox must contain numeric x1,y1,x2,y2");
  }
  if (x1 >= x2 || y1 >= y2) {
    throw new ApiError(400, "observation.bbox must satisfy x1<x2 and y1<y2");
  }

  if (obs.vehicleType !== undefined && obs.vehicleType !== null) {
    if (!["BICYCLE", "CAR", "MOTORCYCLE", "BUS", "TRUCK"].includes(obs.vehicleType)) {
      throw new ApiError(400, "Invalid vehicleType");
    }
  }
  if (
    obs.streamSessionId !== undefined &&
    obs.streamSessionId !== null &&
    (typeof obs.streamSessionId !== "string" ||
      obs.streamSessionId.length < 1 ||
      obs.streamSessionId.length > 64)
  ) {
    throw new ApiError(400, "observation.streamSessionId must be a non-empty string up to 64 characters");
  }

  return obs;
};

// Entry point: accepts a batch of new confirmed-track observations, validates
// the camera and each observation, dedupes by observationId, and creates INFO
// events, emitting event:new via Socket.IO for each committed row.
const ingestObservations = async ({ schemaVersion, cameraCode, observations }) => {
  if (schemaVersion !== 1) {
    throw new ApiError(400, "Unsupported schemaVersion");
  }
  assertRequired(cameraCode, "cameraCode is required");
  assertRequired(observations, "observations is required");
  if (!Array.isArray(observations)) {
    throw new ApiError(400, "observations must be an array");
  }
  if (observations.length === 0) {
    return { eventsCreated: 0 };
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }
  if (!camera.enabled) {
    throw new ApiError(400, "Camera is disabled");
  }

  const created = [];

  for (const obs of observations) {
    validateObservation(obs);

    const observationId = obs.observationId;
    const existing =
      observationId != null
        ? await eventRepository.findByObservationId(camera.id, String(observationId))
        : null;
    if (existing) {
      // Duplicate request — skip re-insertion.
      continue;
    }

    // The AI process may retry with a newly generated observationId. For live
    // detection events, camera + stream session + track + type is the actual
    // semantic identity. Only use this key when the session is supplied so
    // legacy/file observations retain their existing behavior.
    const existingTrackEvent = obs.streamSessionId
      ? await eventRepository.findDetectionBySessionTrack(
          camera.id,
          obs.streamSessionId,
          obs.trackId,
          obs.eventType
        )
      : null;
    if (existingTrackEvent) {
      continue;
    }

    const context = {
      source: "AI_ENGINE",
      observationId: observationId != null ? String(observationId) : null,
      trackId: obs.trackId,
      bbox: obs.bbox,
      streamSessionId: obs.streamSessionId || null,
    };
    if (obs.vehicleType) {
      context.vehicleType = obs.vehicleType;
    }

    const event = await eventRepository.create({
      eventCode: crypto.randomUUID(),
      cameraId: camera.id,
      eventType: obs.eventType,
      objectType: obs.objectType,
      trackId: obs.trackId,
      confidence: obs.confidence,
      riskScore: 0,
      severity: "INFO",
      status: "NEW",
      context,
      occurredAt: new Date(obs.occurredAt).toISOString().slice(0, 19).replace("T", " "),
    });

    const safe = toSafeEvent(event);
    // toSafeEvent strips internal id; camera_code is included via the join.
    realtimeService.emitEventNew(event);
    created.push(safe);
  }

  return { eventsCreated: created.length };
};

module.exports = { ingestObservations, validateObservation };
