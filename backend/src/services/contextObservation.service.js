const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { assertRequired, assertOneOf } = require("../utils/validation");
const cameraRepository = require("../repositories/camera.repository");
const eventRepository = require("../repositories/event.repository");
const realtimeService = require("../realtime/realtime.service");
const { toSafeEvent } = require("./event.service");

// Controlled allowlist of context types the AI Context Intelligence Engine
// (Phase 9) is permitted to emit. Never creates alerts and never sets risk.
const CONTEXT_TYPES = [
  "ZONE_ENTER",
  "ZONE_EXIT",
  "RESTRICTED_ZONE_ENTRY",
  "VIRTUAL_FENCE_CROSSING",
  "FENCE_PROXIMITY",
  "LOITERING",
  "NIGHT_MOVEMENT",
  "REPEATED_ENTRY",
  "ZONE_PRESENCE",
];

const CONTEXT_SOURCE = "AI_CONTEXT_ENGINE";
const OBJECT_TYPES = ["PERSON", "VEHICLE"];

// Validate a single context observation. Throws 400 on malformed fields.
const validateContextObservation = (obs) => {
  assertRequired(obs.observationId, "observation.observationId is required");
  if (typeof obs.observationId !== "string") {
    throw new ApiError(400, "observation.observationId must be a string");
  }
  assertRequired(obs.trackId, "observation.trackId is required");
  if (obs.objectType !== undefined && obs.objectType !== null) {
    assertOneOf(obs.objectType, OBJECT_TYPES, "objectType");
  }
  assertRequired(obs.contextType, "observation.contextType is required");
  assertOneOf(obs.contextType, CONTEXT_TYPES, "contextType");
  assertRequired(obs.occurredAt, "observation.occurredAt is required");

  const { referencePoint } = obs;
  assertRequired(referencePoint, "observation.referencePoint is required");
  assertRequired(referencePoint.x, "observation.referencePoint.x is required");
  assertRequired(referencePoint.y, "observation.referencePoint.y is required");
  if (typeof referencePoint.x !== "number" || typeof referencePoint.y !== "number") {
    throw new ApiError(400, "observation.referencePoint.x/y must be numbers");
  }
  if (referencePoint.x < 0 || referencePoint.x > 1 || referencePoint.y < 0 || referencePoint.y > 1) {
    throw new ApiError(400, "observation.referencePoint must be normalized (0..1)");
  }

  if (obs.metadata !== undefined && obs.metadata !== null) {
    if (typeof obs.metadata !== "object" || Array.isArray(obs.metadata)) {
      throw new ApiError(400, "observation.metadata must be an object");
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

// Entry point: accepts a batch of new context observations, validates the
// camera and each observation, dedupes by observationId, and creates INFO
// events (risk stays null). Emits event:new only — never alert:new.
const ingestContextObservations = async ({ schemaVersion, cameraCode, observations }) => {
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
    validateContextObservation(obs);

    const observationId = String(obs.observationId);
    const existing =
      observationId != null
        ? await eventRepository.findByObservationId(camera.id, observationId)
        : null;
    if (existing) {
      // Duplicate request — skip re-insertion (idempotency by observationId).
      continue;
    }

    const context = {
      source: CONTEXT_SOURCE,
      observationId,
      trackId: obs.trackId,
      objectType: obs.objectType || null,
      contextType: obs.contextType,
      referencePoint: obs.referencePoint,
      streamSessionId: obs.streamSessionId || null,
    };
    if (obs.sourceTimestampMs !== undefined && obs.sourceTimestampMs !== null) {
      context.sourceTimestampMs = obs.sourceTimestampMs;
    }
    if (obs.metadata && Object.keys(obs.metadata).length > 0) {
      context.metadata = obs.metadata;
    }

    const event = await eventRepository.create({
      eventCode: crypto.randomUUID(),
      cameraId: camera.id,
      eventType: obs.contextType,
      objectType: obs.objectType || null,
      trackId: obs.trackId,
      confidence: null,
      riskScore: null,
      severity: "INFO",
      status: "NEW",
      context,
      occurredAt: new Date(obs.occurredAt).toISOString().slice(0, 19).replace("T", " "),
    });

    const safe = toSafeEvent(event);
    realtimeService.emitEventNew(event);
    created.push(safe);
  }

  return { eventsCreated: created.length };
};

module.exports = { ingestContextObservations, validateContextObservation, CONTEXT_TYPES, CONTEXT_SOURCE };
