const { SOCKET_EVENTS } = require("./events");
const { getPool } = require("../config/database");
const logger = require("../utils/logger");

// The live Socket.IO server instance (set once by initializeSocket). All emits
// go through this module so no controller/service ever calls io.emit directly.
let io = null;

const setIO = (server) => {
  io = server;
};

const ready = () => Boolean(io);

// ---- Safe serializers (whitelist only; never leak credentials/paths) ----

const safeAlert = (alert) => {
  if (!alert) return null;
  return {
    alertCode: alert.alert_code || alert.alertCode,
    alertType: alert.alert_type || alert.alertType,
    severity: alert.severity,
    riskScore: alert.risk_score ?? alert.riskScore,
    status: alert.status,
    cameraCode: alert.camera_code || alert.cameraCode || null,
    cameraId: alert.camera_id || alert.cameraId || null,
    eventCode: alert.event_code || alert.eventCode || null,
    acknowledgedBy:
      alert.acknowledged_by_name ||
      alert.acknowledgedByName ||
      alert.acknowledged_by ||
      alert.acknowledgedBy ||
      null,
    acknowledgedAt: alert.acknowledged_at || alert.acknowledgedAt || null,
    resolutionType: alert.resolution_type || null,
    resolutionNotes: alert.resolution_notes || null,
    escalated: Boolean(alert.escalated),
    escalationReason: alert.escalation_reason || null,
    isProtected: Boolean(alert.is_protected ?? alert.isProtected),
    deletedAt: alert.deleted_at || alert.deletedAt || null,
    createdAt: alert.created_at || alert.createdAt || null,
    updatedAt: alert.updated_at || alert.updatedAt || null,
  };
};

const safeCamera = (camera) => {
  if (!camera) return null;
  // Deliberately excludes stream_url/streamUrl/rtsp credentials entirely.
  return {
    cameraCode: camera.camera_code || camera.cameraCode,
    name: camera.name,
    locationName: camera.location_name || camera.locationName || null,
    sector: camera.sector || null,
    streamStatus: camera.stream_status || camera.streamStatus || null,
    aiStatus: camera.ai_status || camera.aiStatus || null,
    sourceType: camera.source_type || camera.sourceType || null,
    streamProtocol: camera.stream_protocol || camera.streamProtocol || null,
    enabled: Boolean(camera.enabled),
    lastSeenAt: camera.last_seen_at || camera.lastSeenAt || null,
  };
};

const safeZone = (zone) => {
  if (!zone) return null;
  return {
    zoneCode: zone.zone_code,
    name: zone.name,
    zoneType: zone.zone_type,
    riskLevel: zone.risk_level,
    cameraCode: zone.camera_code || null,
    enabled: Boolean(zone.enabled),
    updatedAt: zone.updated_at || null,
  };
};

const safeRiskRule = (rule) => {
  if (!rule) return null;
  return {
    ruleCode: rule.rule_code,
    name: rule.name,
    weight: rule.weight,
    enabled: Boolean(rule.enabled),
    updatedAt: rule.updated_at || null,
  };
};

const safeEvent = (event) => {
  if (!event) return null;
  return {
    eventCode: event.event_code,
    eventType: event.event_type,
    severity: event.severity,
    riskScore: event.risk_score,
    status: event.status,
    cameraCode: event.camera_code || null,
    cameraId: event.camera_id || null,
    objectType: event.object_type || null,
    occurredAt: event.occurred_at || event.created_at || null,
    isProtected: Boolean(event.is_protected),
    deletedAt: event.deleted_at || null,
  };
};

const safeProfile = (user) => ({
  publicId: user.public_id || user.publicId,
  fullName: user.full_name || user.fullName,
  role: user.role,
  status: user.status,
});

const safeSystemStatus = (status) => {
  if (!status) return null;
  return {
    service: status.service || "IBVAP API",
    status: status.status || "unknown",
    database: status.database ? { status: status.database.status } : null,
    uptime: status.uptime ?? null,
    timestamp: new Date().toISOString(),
  };
};

// Build the standard event envelope: { type, timestamp, data }.
const envelope = (type, data) => ({
  type,
  timestamp: new Date().toISOString(),
  data,
});

// Role-based audience rooms (synced with socketAuth room assignment).
const ROOM_BY_ROLE = {
  ADMINISTRATOR: "role:ADMINISTRATOR",
  SECURITY_OPERATOR: "role:SECURITY_OPERATOR",
  AUDITOR_ANALYST: "role:AUDITOR_ANALYST",
};

const roomForRole = (role) => ROOM_BY_ROLE[role] || null;

// Emit to every authorized actor regardless of role (broadcast role rooms).
const broadcastAll = (event, data, exceptSocketId = null) => {
  if (!ready()) return;
  const payload = envelope(event, data);
  if (exceptSocketId) {
    io.sockets.sockets.forEach((s) => {
      if (s.id !== exceptSocketId) s.emit(event, payload);
    });
  } else {
    io.emit(event, payload);
  }
};

const emitToRooms = (rooms, event, data) => {
  if (!ready()) return;
  const payload = envelope(event, data);
  rooms.forEach((room) => {
    if (room) io.to(room).emit(event, payload);
  });
};

// ---- Public emit helpers (used by services after DB commits) ----

const emitAlertAcknowledged = (alert) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("SECURITY_OPERATOR")],
    SOCKET_EVENTS.ALERT_ACKNOWLEDGED,
    safeAlert(alert)
  );

const emitAlertResolved = (alert) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("SECURITY_OPERATOR"), roomForRole("AUDITOR_ANALYST")],
    SOCKET_EVENTS.ALERT_RESOLVED,
    safeAlert(alert)
  );

const emitAlertUpdated = (alert) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("SECURITY_OPERATOR"), roomForRole("AUDITOR_ANALYST")],
    SOCKET_EVENTS.ALERT_UPDATED,
    safeAlert(alert)
  );

const emitAlertNew = (alert) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("SECURITY_OPERATOR")],
    SOCKET_EVENTS.ALERT_NEW,
    safeAlert(alert)
  );

const emitEventNew = (event) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("SECURITY_OPERATOR"), roomForRole("AUDITOR_ANALYST")],
    SOCKET_EVENTS.EVENT_NEW,
    safeEvent(event)
  );

const emitEventUpdated = (event) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("SECURITY_OPERATOR"), roomForRole("AUDITOR_ANALYST")],
    SOCKET_EVENTS.EVENT_UPDATED,
    safeEvent(event)
  );

// Camera payloads are global for administrators/analysts, but an operator may
// receive them only through their server-assigned personal room. This mirrors
// the REST assignment check and prevents an unassigned camera from appearing
// after a realtime upsert.
const emitCameraToAuthorizedRooms = async (event, camera) => {
  const safe = safeCamera(camera);
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), roomForRole("AUDITOR_ANALYST")],
    event,
    safe
  );
  if (!ready() || !safe?.cameraCode) return;
  try {
    const [rows] = await getPool().execute(
      `SELECT DISTINCT u.public_id
         FROM operator_camera_assignments oca
         JOIN users u ON u.id = oca.operator_id
         JOIN cameras c ON c.id = oca.camera_id
        WHERE c.camera_code = ? AND c.deleted_at IS NULL
          AND u.role = 'SECURITY_OPERATOR' AND u.status = 'ACTIVE'`,
      [safe.cameraCode]
    );
    emitToRooms(rows.map((row) => `user:${row.public_id}`), event, safe);
  } catch (err) {
    logger.error(`Authorized camera realtime emit failed: ${err.message}`);
  }
};

const emitCameraUpdated = (camera) =>
  emitCameraToAuthorizedRooms(SOCKET_EVENTS.CAMERA_UPDATED, camera);

const emitCameraStatus = (camera) =>
  emitCameraToAuthorizedRooms(SOCKET_EVENTS.CAMERA_STATUS, camera);

const emitZoneUpdated = (zone) =>
  emitToRooms([roomForRole("ADMINISTRATOR")], SOCKET_EVENTS.ZONE_UPDATED, safeZone(zone));

const emitRiskRuleUpdated = (rule) =>
  emitToRooms([roomForRole("ADMINISTRATOR")], SOCKET_EVENTS.RISK_RULE_UPDATED, safeRiskRule(rule));

const emitSystemStatus = (status) =>
  broadcastAll(SOCKET_EVENTS.SYSTEM_STATUS, safeSystemStatus(status));

const emitProfileUpdated = (user) =>
  emitToRooms(
    [roomForRole("ADMINISTRATOR"), `user:${user.public_id || user.publicId}`],
    SOCKET_EVENTS.PROFILE_UPDATED,
    safeProfile(user)
  );

const emitOperationalDataCleaned = (stats) =>
  broadcastAll(SOCKET_EVENTS.OPERATIONAL_DATA_CLEANED, {
    cleanupId: stats.cleanupId,
    eventsAfter: Number(stats.eventsAfter || 0),
    alertsAfter: Number(stats.alertsAfter || 0),
    evidenceRecordsAfter: Number(stats.evidenceRecordsAfter || 0),
  });

module.exports = {
  setIO,
  ready,
  envelope,
  roomForRole,
  safeAlert,
  safeCamera,
  safeZone,
  safeRiskRule,
  safeEvent,
  safeSystemStatus,
  safeProfile,
  emitAlertAcknowledged,
  emitAlertResolved,
  emitAlertUpdated,
  emitAlertNew,
  emitEventNew,
  emitEventUpdated,
  emitCameraUpdated,
  emitCameraStatus,
  emitZoneUpdated,
  emitRiskRuleUpdated,
  emitSystemStatus,
  emitProfileUpdated,
  emitOperationalDataCleaned,
};
