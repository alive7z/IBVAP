import request from "./api";

// Single mapper: backend alert (snake_case DB columns, some camelCase aliases in
// detail responses) -> the camelCase shape the alert components expect.
const STATUS_MAP = {
  NEW: "new",
  ACTIVE: "active",
  OPEN: "active",
  UNACKNOWLEDGED: "active",
  ACKNOWLEDGED: "acknowledged",
  INVESTIGATING: "investigating",
  RESOLVED: "resolved",
  FALSE_POSITIVE: "false_positive",
};

function mapAlert(a) {
  if (!a) return null;
  const statusKey = a.status ? String(a.status).trim().toUpperCase() : "";
  const status = STATUS_MAP[statusKey] || (statusKey ? statusKey.toLowerCase() : a.status);
  const resolution =
    a.resolution_type || a.resolved_by || a.resolution_notes
      ? {
          type: a.resolution_type || null,
          notes: a.resolution_notes || null,
          by: a.resolved_by || null,
        }
      : null;
  return {
    id: a.alert_code,
    eventId: a.event_code || a.eventCode || null,
    eventType: a.alert_type,
    type: a.alert_type,
    cameraId: a.camera_code || a.cameraCode || a.camera_id,
    camera: a.camera_code || a.cameraCode || a.camera_id,
    cameraName: a.camera_name || a.cameraName || a.camera_code || a.cameraCode || null,
    location: null,
    zone: null,
    objectType: null,
    trackId: null,
    severity: a.severity,
    riskScore: a.risk_score ?? a.riskScore ?? null,
    status,
    timestamp: a.created_at || a.createdAt || null,
    time: a.created_at || a.createdAt || null,
    reason: a.reason || null,
    reasons: [],
    evidence: null,
    timeline: [],
    relatedEvents: [],
    acknowledgedBy: a.acknowledged_by_name || a.acknowledgedByName || a.acknowledged_by || null,
    acknowledgedAt: a.acknowledged_at || a.acknowledgedAt || null,
    isProtected: a.is_protected ? Boolean(a.is_protected) : Boolean(a.isProtected),
    escalated: a.escalated ? Boolean(a.escalated) : null,
    escalationReason: a.escalation_reason || null,
    deletedAt: a.deleted_at || a.deletedAt || null,
    resolution,
  };
}

// Resolve the backend "detail/action returns { alert }" wrapper.
function unwrap(res, mapper) {
  const raw = res.data?.alert || res.data;
  return { ...res, data: mapper(raw) };
}

// GET /api/alerts  -> { data: [alert, ...] }
export function getAlerts(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return request(`/api/alerts${qs ? `?${qs}` : ""}`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapAlert),
    pagination: res.data?.pagination || {},
  }));
}

// GET /api/alerts/summary  -> canonical global counters for the summary cards.
export function getAlertsSummary() {
  return request("/api/alerts/summary").then((res) => {
    const s = res.data || {};
    return {
      ...res,
      data: {
        totalActive: Number(s.totalActive || 0),
        critical: Number(s.critical || 0),
        high: Number(s.high || 0),
        medium: Number(s.medium || 0),
        acknowledged: Number(s.acknowledged || 0),
        resolved: Number(s.resolved || 0),
      },
    };
  });
}

// GET /api/alerts/:alertCode  -> data = alert
export function getAlertById(id) {
  return request(`/api/alerts/${id}`).then((res) => unwrap(res, mapAlert));
}

// POST /api/alerts/:alertCode/acknowledge
// Backend derives the actor from the JWT; it returns the updated alert.
export function acknowledgeAlert(id) {
  return request(`/api/alerts/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({}),
  }).then((res) => unwrap(res, mapAlert));
}

// POST /api/alerts/:alertCode/resolve
// Translate the UI's { type, notes } to the backend's resolutionType/notes.
export function resolveAlert(id, data = {}) {
  return request(`/api/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({
      resolutionType: data.type || data.resolutionType || null,
      resolutionNotes: data.notes || data.resolutionNotes || null,
    }),
  }).then((res) => unwrap(res, mapAlert));
}

// POST /api/alerts/:alertCode/investigate
export function investigateAlert(id) {
  return request(`/api/alerts/${id}/investigate`, {
    method: "POST",
    body: JSON.stringify({}),
  }).then((res) => unwrap(res, mapAlert));
}

// POST /api/alerts/:alertCode/false-positive
export function falsePositiveAlert(id, data = {}) {
  return request(`/api/alerts/${id}/false-positive`, {
    method: "POST",
    body: JSON.stringify({
      resolutionNotes: data.notes || data.resolutionNotes || null,
    }),
  }).then((res) => unwrap(res, mapAlert));
}

// POST /api/alerts/:alertCode/escalate
export function escalateAlert(id, data = {}) {
  return request(`/api/alerts/${id}/escalate`, {
    method: "POST",
    body: JSON.stringify({ escalationReason: data.reason || data.escalationReason || null }),
  }).then((res) => unwrap(res, mapAlert));
}

// POST /api/alerts/:alertCode/protect | /unprotect
export function protectAlert(id) {
  return request(`/api/alerts/${id}/protect`, {
    method: "POST",
    body: JSON.stringify({}),
  }).then((res) => unwrap(res, mapAlert));
}

export function unprotectAlert(id) {
  return request(`/api/alerts/${id}/unprotect`, {
    method: "POST",
    body: JSON.stringify({}),
  }).then((res) => unwrap(res, mapAlert));
}

// DELETE /api/alerts/:alertCode (soft delete, admin)
export function deleteAlert(id, data = {}) {
  return request(`/api/alerts/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ deletionReason: data.reason || data.deletionReason || null }),
  }).then((res) => unwrap(res, mapAlert));
}

// Adapter for realtime socket payloads (camelCase from the server serializer)
// -> the same view shape the lists/components consume.
export function fromSocketAlert(p) {
  if (!p) return null;
  return {
    id: p.alertCode,
    eventId: p.eventCode || null,
    eventType: p.alertType,
    type: p.alertType,
    cameraId: p.cameraCode || p.cameraId || null,
    camera: p.cameraCode || null,
    cameraName: null,
    location: null,
    zone: null,
    objectType: null,
    trackId: null,
    severity: p.severity,
    riskScore: p.riskScore,
    status: STATUS_MAP[String(p.status || "").trim().toUpperCase()] ||
      (p.status ? String(p.status).toLowerCase() : p.status),
    timestamp: p.createdAt || p.updatedAt || null,
    time: p.createdAt || p.updatedAt || null,
    reason: null,
    reasons: [],
    evidence: null,
    timeline: [],
    relatedEvents: [],
    acknowledgedBy: p.acknowledgedBy || null,
    acknowledgedAt: p.acknowledgedAt || null,
    isProtected: p.isProtected ? Boolean(p.isProtected) : false,
    deletedAt: p.deletedAt || null,
    escalated: p.escalated ? Boolean(p.escalated) : null,
    escalationReason: p.escalationReason || null,
    resolution:
      p.resolutionType || p.resolutionNotes
        ? { type: p.resolutionType || null, notes: p.resolutionNotes || null, by: p.acknowledgedBy || null }
        : null,
  };
}
