const alertRepository = require("../repositories/alert.repository");
const auditService = require("./audit.service");
const realtimeService = require("../realtime/realtime.service");
const ApiError = require("../utils/ApiError");
const { parseDateRange } = require("../utils/datetime");
const { assertOneOf, parseNumber } = require("../utils/validation");

const normalizeEnumFilter = (filters, key) => {
  if (filters[key] !== undefined && filters[key] !== null && filters[key] !== "") {
    filters[key] = String(filters[key]).trim().toUpperCase();
  }
};

const toSafeAlert = (alert) => {
  if (!alert) return null;
  const { id: _id, ...safe } = alert;
  return safe;
};

const VALID_TRANSITIONS = {
  NEW: ["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"],
  ACTIVE: ["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"],
  ACKNOWLEDGED: ["INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"],
  INVESTIGATING: ["ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"],
  RESOLVED: [],
  FALSE_POSITIVE: [],
};

const assertCanOperateOnSeverity = (alert, actor) => {
  // CRITICAL alerts always require an administrator. Escalating one grants
  // visibility to administrators; it never promotes an operator's authority.
  if (actor.role !== "ADMINISTRATOR" && alert.severity === "CRITICAL") {
    throw new ApiError(
      403,
      "CRITICAL alerts must be escalated to an administrator before being handled"
    );
  }
};

const assertCanAcknowledgeSeverity = (alert, actor) => {
  const allowed = actor.role === "ADMINISTRATOR"
    ? ["MEDIUM", "HIGH", "CRITICAL"]
    : actor.role === "SECURITY_OPERATOR"
      ? ["MEDIUM", "HIGH"]
      : [];
  if (!allowed.includes(String(alert.severity || "").toUpperCase())) {
    throw new ApiError(403, "This role cannot acknowledge alerts of this severity");
  }
};

const listAlerts = async (filters) => {
  normalizeEnumFilter(filters, "severity");
  normalizeEnumFilter(filters, "status");
  if (filters.severity) {
    assertOneOf(filters.severity, alertRepository.SEVERITIES, "severity");
  }
  if (filters.status) {
    assertOneOf(filters.status, alertRepository.ALERT_STATUSES, "status");
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

  const result = await alertRepository.findMany({ ...filters, ...range });
  return {
    items: result.items.map(toSafeAlert),
    pagination: result.pagination,
  };
};

const getAlertSummary = async () => {
  return alertRepository.getSummary();
};

const getAlert = async (alertId) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }
  return toSafeAlert(alert);
};

const assertTransition = (from, to) => {
  if (!VALID_TRANSITIONS[from] || !VALID_TRANSITIONS[from].includes(to)) {
    throw new ApiError(409, `Cannot transition alert from ${from} to ${to}`);
  }
};

const acknowledgeAlert = async (alertId, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  assertTransition(alert.status, "ACKNOWLEDGED");
  assertCanAcknowledgeSeverity(alert, actor);

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.acknowledge({
      id: alert.id,
      userId: actor.userId,
      conn,
    });

    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "ALERT_ACKNOWLEDGED",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code },
        ipAddress: actor.ipAddress,
      },
      conn
    );

    await alertRepository.commit(conn);
    realtimeService.emitAlertAcknowledged(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const investigateAlert = async (alertId, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  assertTransition(alert.status, "INVESTIGATING");
  assertCanOperateOnSeverity(alert, actor);

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.startInvestigation({
      id: alert.id,
      userId: actor.userId,
      conn,
    });

    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "ALERT_INVESTIGATING",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code },
        ipAddress: actor.ipAddress,
      },
      conn
    );

    await alertRepository.commit(conn);
    realtimeService.emitAlertUpdated(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const falsePositiveAlert = async (alertId, data, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  assertTransition(alert.status, "FALSE_POSITIVE");
  assertCanOperateOnSeverity(alert, actor);

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.markFalsePositive({
      id: alert.id,
      userId: actor.userId,
      notes: data.resolutionNotes || null,
      conn,
    });

    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "ALERT_FALSE_POSITIVE",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code },
        ipAddress: actor.ipAddress,
      },
      conn
    );

    await alertRepository.commit(conn);
    realtimeService.emitAlertResolved(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const escalateAlert = async (alertId, data, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }
  if (alert.status === "RESOLVED" || alert.status === "FALSE_POSITIVE") {
    throw new ApiError(409, `Cannot escalate an alert in ${alert.status} status`);
  }
  if (alert.severity !== "CRITICAL") {
    throw new ApiError(409, "Only CRITICAL alerts can be escalated");
  }
  if (alert.escalated) {
    throw new ApiError(409, "Alert has already been escalated");
  }
  if (actor.role !== "SECURITY_OPERATOR" && actor.role !== "ADMINISTRATOR") {
    throw new ApiError(403, "Insufficient role permissions");
  }

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.escalateForReview({
      id: alert.id,
      userId: actor.userId,
      reason: data.escalationReason || null,
      conn,
    });

    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "ALERT_ESCALATED",
        entityType: "alert",
        entityId: updated.alert_code,
        details: {
          alertCode: updated.alert_code,
          escalationReason: updated.escalation_reason,
        },
        ipAddress: actor.ipAddress,
      },
      conn
    );

    await alertRepository.commit(conn);
    realtimeService.emitAlertUpdated(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const resolveAlert = async (alertId, data, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  assertTransition(alert.status, "RESOLVED");
  assertCanOperateOnSeverity(alert, actor);
  if (data.resolutionType !== undefined && data.resolutionType !== null && data.resolutionType !== "") {
    if (typeof data.resolutionType !== "string" || data.resolutionType.length > 64) {
      throw new ApiError(400, "resolutionType must be a string of at most 64 characters");
    }
  }

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.resolve({
      id: alert.id,
      userId: actor.userId,
      resolutionType: data.resolutionType || null,
      resolutionNotes: data.resolutionNotes || null,
      conn,
    });

    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "ALERT_RESOLVED",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code, resolutionType: updated.resolution_type },
        ipAddress: actor.ipAddress,
      },
      conn
    );

    await alertRepository.commit(conn);
    realtimeService.emitAlertResolved(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const protectAlert = async (alertId, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.protect({ id: alert.id, userId: actor.userId, conn });
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "PROTECTED_INCIDENT",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code },
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await alertRepository.commit(conn);
    realtimeService.emitAlertUpdated(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const unprotectAlert = async (alertId, actor) => {
  const alert = await alertRepository.findByCode(alertId);
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.unprotect({ id: alert.id, userId: actor.userId, conn });
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "UNPROTECTED_INCIDENT",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code },
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await alertRepository.commit(conn);
    realtimeService.emitAlertUpdated(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

const deleteAlert = async (alertId, data, actor) => {
  const alert = await alertRepository.findByCode(alertId, { includeDeleted: true });
  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }
  if (alert.is_protected) {
    throw new ApiError(409, "Protected alerts cannot be deleted; unprotect it first");
  }

  const conn = await alertRepository.beginTransaction();
  try {
    const updated = await alertRepository.softDelete({
      id: alert.id,
      userId: actor.userId,
      reason: data.deletionReason || null,
      conn,
    });
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "ALERT_DELETED",
        entityType: "alert",
        entityId: updated.alert_code,
        details: { alertCode: updated.alert_code, deletionReason: updated.deletion_reason },
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await alertRepository.commit(conn);
    realtimeService.emitAlertUpdated(updated);
    return toSafeAlert(updated);
  } catch (err) {
    await alertRepository.rollback(conn);
    throw err;
  } finally {
    await alertRepository.release(conn);
  }
};

// Periodic, query-based escalation for unattended HIGH alerts. This avoids a
// timer per alert and remains restart-safe because eligibility lives in MySQL.
const escalateOverdueHighAlerts = async (seconds) => {
  const threshold = Number(seconds);
  if (!Number.isFinite(threshold) || threshold <= 0) return { escalatedCount: 0 };

  const candidates = await alertRepository.findOverdueHighAlerts(threshold);
  let escalatedCount = 0;
  for (const candidate of candidates) {
    const conn = await alertRepository.beginTransaction();
    try {
      const reason = `Unacknowledged HIGH alert exceeded ${threshold} seconds`;
      const updated = await alertRepository.markTimedEscalated({
        id: candidate.id,
        reason,
        conn,
      });
      if (!updated) {
        await alertRepository.commit(conn);
        continue;
      }
      await auditService.recordAudit(
        {
          userId: null,
          action: "ALERT_ESCALATED",
          entityType: "alert",
          entityId: updated.alert_code,
          details: {
            alertCode: updated.alert_code,
            escalationReason: reason,
            automated: true,
          },
          ipAddress: null,
        },
        conn
      );
      await alertRepository.commit(conn);
      escalatedCount += 1;
      realtimeService.emitAlertUpdated(updated);
    } catch (err) {
      await alertRepository.rollback(conn);
      throw err;
    } finally {
      await alertRepository.release(conn);
    }
  }
  return { escalatedCount };
};

module.exports = {
  listAlerts,
  getAlert,
  getAlertSummary,
  acknowledgeAlert,
  investigateAlert,
  falsePositiveAlert,
  escalateAlert,
  resolveAlert,
  protectAlert,
  unprotectAlert,
  deleteAlert,
  escalateOverdueHighAlerts,
  toSafeAlert,
  VALID_TRANSITIONS,
};
