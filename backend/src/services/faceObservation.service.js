const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { assertRequired } = require("../utils/validation");
const cameraRepository = require("../repositories/camera.repository");
const eventRepository = require("../repositories/event.repository");
const realtimeService = require("../realtime/realtime.service");

const FACE_SOURCE = "AI_FACE_ENGINE";

// Validate a single face observation. Throws 400 on malformed fields.
// FACE DETECTION ONLY — this payload carries a bounding box + confidence and
// no identity, name, matchScore, or criminal/wanted status.
const validateFaceObservation = (obs) => {
  assertRequired(obs.observationId, "observation.observationId is required");
  if (typeof obs.observationId !== "string") {
    throw new ApiError(400, "observation.observationId must be a string");
  }
  assertRequired(obs.personTrackId, "observation.personTrackId is required");
  assertRequired(obs.occurredAt, "observation.occurredAt is required");

  if (
    obs.faceDetectionConfidence !== undefined &&
    obs.faceDetectionConfidence !== null &&
    (typeof obs.faceDetectionConfidence !== "number" ||
      obs.faceDetectionConfidence < 0 ||
      obs.faceDetectionConfidence > 1)
  ) {
    throw new ApiError(400, "observation.faceDetectionConfidence must be a number between 0 and 1");
  }

  const { faceBBox } = obs;
  if (faceBBox !== undefined && faceBBox !== null) {
    for (const k of ["x1", "y1", "x2", "y2"]) {
      if (typeof faceBBox[k] !== "number") {
        throw new ApiError(400, `observation.faceBBox.${k} must be a number`);
      }
    }
    if (faceBBox.x1 >= faceBBox.x2 || faceBBox.y1 >= faceBBox.y2) {
      throw new ApiError(400, "observation.faceBBox must satisfy x1<x2 and y1<y2");
    }
  }
  if (
    obs.streamSessionId !== undefined &&
    obs.streamSessionId !== null &&
    (typeof obs.streamSessionId !== "string" || obs.streamSessionId.length < 1 || obs.streamSessionId.length > 64)
  ) {
    throw new ApiError(400, "observation.streamSessionId must be a non-empty string up to 64 characters");
  }

  return obs;
};

// Entry point: accepts a batch of confirmed face observations, validates the
// camera and each observation, dedupes by observationId, and creates a
// FACE_DETECTED INFO event. Emits event:new only — never alert:new, never sets
// risk. Detection-only: no recognition or identity data is stored.
const ingestFaceObservations = async ({ schemaVersion, cameraCode, observations }) => {
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

  let eventsCreated = 0;
  const createdEvents = [];

  for (const obs of observations) {
    validateFaceObservation(obs);

    const observationId = String(obs.observationId);
    const existing =
      observationId != null
        ? await eventRepository.findByObservationId(camera.id, observationId)
        : null;
    if (existing) {
      // Duplicate request — skip re-insertion (idempotency by observationId).
      continue;
    }

    const existingTrackEvent = obs.streamSessionId
      ? await eventRepository.findDetectionBySessionTrack(
          camera.id,
          obs.streamSessionId,
          obs.personTrackId,
          "FACE_DETECTED"
        )
      : null;
    if (existingTrackEvent) continue;

    // FACE_DETECTED is observational and carries NO risk / alert meaning.
    const context = {
      source: FACE_SOURCE,
      observationId,
      personTrackId: obs.personTrackId,
      detectionOnly: true,
      streamSessionId: obs.streamSessionId || null,
    };
    if (obs.sourceTimestampMs !== undefined && obs.sourceTimestampMs !== null) {
      context.sourceTimestampMs = obs.sourceTimestampMs;
    }
    if (obs.faceDetectionConfidence !== undefined && obs.faceDetectionConfidence !== null) {
      context.faceDetectionConfidence = obs.faceDetectionConfidence;
    }
    if (obs.faceBBox) {
      context.faceBBox = obs.faceBBox;
    }

    const event = await eventRepository.create({
      eventCode: crypto.randomUUID(),
      cameraId: camera.id,
      eventType: "FACE_DETECTED",
      objectType: "PERSON",
      trackId: obs.personTrackId,
      confidence: obs.faceDetectionConfidence ?? null,
      riskScore: null,
      severity: "INFO",
      status: "NEW",
      context,
      occurredAt: new Date(obs.occurredAt).toISOString().slice(0, 19).replace("T", " "),
    });

    realtimeService.emitEventNew(event);
    eventsCreated += 1;
    createdEvents.push({ eventId: event.event_code, observationId });
  }

  return { eventsCreated, events: createdEvents };
};

module.exports = { ingestFaceObservations, validateFaceObservation, FACE_SOURCE };
