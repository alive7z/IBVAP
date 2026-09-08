const eventRepository = require("../repositories/event.repository");
const auditService = require("./audit.service");
const realtimeService = require("../realtime/realtime.service");
const ApiError = require("../utils/ApiError");
const { parseDateRange } = require("../utils/datetime");
const { assertOneOf, parseNumber } = require("../utils/validation");

const toSafeEvent = (event) => {
  if (!event) return null;
  const { id: _id, ...safe } = event;
  return safe;
};

const listEvents = async (filters) => {
  for (const key of ["eventType", "objectType", "severity", "status"]) {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== "") {
      filters[key] = String(filters[key]).trim().toUpperCase();
    }
  }
  if (filters.severity !== undefined && filters.severity !== null && filters.severity !== "") {
    filters.severity = String(filters.severity).trim().toUpperCase();
  }
  if (filters.severity) {
    assertOneOf(filters.severity, eventRepository.SEVERITIES, "severity");
  }
  if (filters.minRiskScore !== undefined && filters.minRiskScore !== "" && filters.minRiskScore !== null) {
    filters.minRiskScore = parseNumber(filters.minRiskScore, "minRiskScore", { min: 0, max: 100 });
  }

  let range;
  try {
    range = parseDateRange(filters);
  } catch (err) {
    if (err.isRangeError) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  const result = await eventRepository.findMany({ ...filters, ...range });
  return {
    items: result.items.map(toSafeEvent),
    pagination: result.pagination,
  };
};

const getEvent = async (eventId) => {
  const event = await eventRepository.findByCode(eventId);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  return toSafeEvent(event);
};

const getEventSummary = async () => eventRepository.getSummary();

const runAdminAction = async (event, fn, auditDetails, actor) => {
  const conn = await eventRepository.beginTransaction();
  try {
    await fn(conn);
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: auditDetails.action,
        entityType: "event",
        entityId: event.event_code,
        details: { eventCode: event.event_code },
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await eventRepository.commit(conn);
  } catch (err) {
    await eventRepository.rollback(conn);
    throw err;
  } finally {
    await eventRepository.release(conn);
  }
};

const protectEvent = async (eventId, actor) => {
  const event = await eventRepository.findByCode(eventId);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  await runAdminAction(event, (conn) => eventRepository.protect({ id: event.id, userId: actor.userId, conn }), { action: "PROTECTED_INCIDENT" }, actor);
  const updated = await eventRepository.findByCode(eventId);
  realtimeService.emitEventUpdated(updated);
  return toSafeEvent(updated);
};

const unprotectEvent = async (eventId, actor) => {
  const event = await eventRepository.findByCode(eventId);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  await runAdminAction(event, (conn) => eventRepository.unprotect({ id: event.id, conn }), { action: "UNPROTECTED_INCIDENT" }, actor);
  const updated = await eventRepository.findByCode(eventId);
  realtimeService.emitEventUpdated(updated);
  return toSafeEvent(updated);
};

const deleteEvent = async (eventId, data, actor) => {
  const event = await eventRepository.findByCode(eventId, { includeDeleted: true });
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  if (event.is_protected) {
    throw new ApiError(409, "Protected events cannot be deleted; unprotect it first");
  }
  await runAdminAction(
    event,
    (conn) => eventRepository.softDelete({ id: event.id, userId: actor.userId, reason: data.deletionReason || null, conn }),
    { action: "EVENT_DELETED" },
    actor
  );
  const updated = await eventRepository.findByCode(eventId, { includeDeleted: true });
  realtimeService.emitEventUpdated(updated);
  return toSafeEvent(updated);
};

module.exports = { listEvents, getEvent, getEventSummary, protectEvent, unprotectEvent, deleteEvent, toSafeEvent };
