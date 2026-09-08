const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { assertRequired, assertOneOf } = require("../utils/validation");
const cameraRepository = require("../repositories/camera.repository");
const eventRepository = require("../repositories/event.repository");
const realtimeService = require("../realtime/realtime.service");
const alertManager = require("./alertManager.service");
const { toSafeEvent } = require("./event.service");

// Controlled allowlist of severities the AI Risk Engine (Phase 10) may emit.
// Each risk observation maps to a SUSPICIOUS_ACTIVITY event — never an alert.
const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

const RISK_SOURCE = "AI_RISK_ENGINE";

// Validate a single risk observation. Throws 400 on malformed fields.
const validateRiskObservation = (obs) => {
  assertRequired(obs.observationId, "observation.observationId is required");
  if (typeof obs.observationId !== "string") {
    throw new ApiError(400, "observation.observationId must be a string");
  }
  assertRequired(obs.trackId, "observation.trackId is required");
  assertRequired(obs.riskScore, "observation.riskScore is required");
  if (typeof obs.riskScore !== "number" || Number.isNaN(obs.riskScore)) {
    throw new ApiError(400, "observation.riskScore must be a number");
  }
  if (obs.riskScore < 0 || obs.riskScore > 100) {
    throw new ApiError(400, "observation.riskScore must be between 0 and 100");
  }
  assertRequired(obs.riskSeverity, "observation.riskSeverity is required");
  assertOneOf(obs.riskSeverity, SEVERITIES, "riskSeverity");
  assertRequired(obs.occurredAt, "observation.occurredAt is required");

  if (obs.reasons !== undefined && obs.reasons !== null && !Array.isArray(obs.reasons)) {
    throw new ApiError(400, "observation.reasons must be an array");
  }
  if (obs.evidence !== undefined && obs.evidence !== null && !Array.isArray(obs.evidence)) {
    throw new ApiError(400, "observation.evidence must be an array");
  }
  if (
    obs.streamSessionId !== undefined && obs.streamSessionId !== null &&
    typeof obs.streamSessionId !== "string"
  ) {
    throw new ApiError(400, "observation.streamSessionId must be a string");
  }

  return obs;
};

// Entry point: accepts a batch of new risk observations, validates the camera
// and each observation, dedupes by observationId, and creates SUSPICIOUS_ACTIVITY
// events carrying risk_score + severity. Emits event:new only — NEVER alert:new.
const ingestRiskObservations = async ({ schemaVersion, cameraCode, observations }) => {
  if (schemaVersion !== 1) {
    throw new ApiError(400, "Unsupported schemaVersion");
  }
  assertRequired(cameraCode, "cameraCode is required");
  assertRequired(observations, "observations is required");
  if (!Array.isArray(observations)) {
    throw new ApiError(400, "observations must be an array");
  }
  if (observations.length === 0) {
    return { eventsCreated: 0, alertActions: [] };
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }
  if (!camera.enabled) {
    throw new ApiError(400, "Camera is disabled");
  }

  const created = [];
  const decisions = [];

  for (const obs of observations) {
    let decision = { action: "NONE" };

    validateRiskObservation(obs);

    const observationId = String(obs.observationId);
    const existing =
      observationId != null
        ? await eventRepository.findByObservationId(camera.id, observationId)
        : null;
    if (existing) {
      // Duplicate request — skip re-insertion (idempotency by observationId).
      decisions.push(decision);
      continue;
    }

    const context = {
      source: RISK_SOURCE,
      observationId,
      trackId: obs.trackId,
      riskScore: obs.riskScore,
      riskSeverity: obs.riskSeverity,
    };
    if (obs.sourceTimestampMs !== undefined && obs.sourceTimestampMs !== null) {
      context.sourceTimestampMs = obs.sourceTimestampMs;
    }
    if (obs.streamSessionId) {
      context.streamSessionId = obs.streamSessionId;
    }
    if (obs.objectType) {
      context.objectType = obs.objectType;
    }
    if (obs.reasons && obs.reasons.length > 0) {
      context.reasons = obs.reasons;
    }
    if (obs.evidence && obs.evidence.length > 0) {
      context.evidence = obs.evidence;
    }

    const event = await eventRepository.create({
      eventCode: crypto.randomUUID(),
      cameraId: camera.id,
      eventType: "SUSPICIOUS_ACTIVITY",
      objectType: obs.objectType || null,
      trackId: obs.trackId,
      confidence: null,
      riskScore: obs.riskScore,
      severity: obs.riskSeverity,
      status: "NEW",
      context,
      occurredAt: new Date(obs.occurredAt).toISOString().slice(0, 19).replace("T", " "),
    });

    const safe = toSafeEvent(event);
    realtimeService.emitEventNew(event);
    created.push(safe);

    // Phase 11 — Node Alert Manager decides whether this risk event becomes an
    // alert. Python never inserts alerts directly.
    decision = await alertManager.processRiskEvent(event);
    decisions.push(decision);
  }

  const alertActions = alertManager.buildAlertActions(observations, decisions);
  return { eventsCreated: created.length, alertActions };
};

module.exports = {
  ingestRiskObservations,
  validateRiskObservation,
  RISK_SOURCE,
  SEVERITIES,
};
