import request, { buildUrl } from "./api";
import { getToken } from "../utils/token";

// ANPR/face/detection metadata is stored by the backend inside the event's
// context_json (plateText, ocrConfidence, vehicleTrackId / faceDetectionConfidence,
// personTrackId). The UI consumers read it as `event.anpr` / `event.face` /
// `event.object`, so it is derived here once instead of being re-parsed everywhere.
function deriveAnpr(context, event) {
  if (!context || !context.plateText) return undefined;
  return {
    plate: context.plateText,
    ocrConfidence:
      typeof context.ocrConfidence === "number" ? context.ocrConfidence : null,
    vehicleType: context.vehicleType || null,
    trackId: context.vehicleTrackId || null,
    camera: context.cameraCode || null,
    timestamp:
      event.occurred_at ?? event.occurredAt ?? event.created_at ?? event.createdAt ?? null,
  };
}

function deriveFace(context, event) {
  if (!context || typeof context.faceDetectionConfidence !== "number") return undefined;
  return {
    faceEventId: context.observationId || null,
    trackId: context.personTrackId || null,
    confidence: context.faceDetectionConfidence,
    timestamp:
      event.occurred_at ?? event.occurredAt ?? event.created_at ?? event.createdAt ?? null,
  };
}

function deriveObject(context, event) {
  if (!context) return undefined;
  const confidence =
    typeof context.confidence === "number"
      ? context.confidence
      : event.confidence != null
        ? event.confidence
        : null;
  if ((event.object_type ?? event.objectType ?? "").toLowerCase() === "vehicle") {
    return {
      vehicleType: context.vehicleType || null,
      direction: context.direction || null,
      confidence,
      firstSeen: null,
      lastSeen: null,
      duration: null,
    };
  }
  return { confidence, firstSeen: null, lastSeen: null, duration: null };
}

// Single mapper: backend event (snake_case DB columns) -> the camelCase shape
// the event components expect.
function mapEvent(e) {
  if (!e) return null;
  const context = e.context ?? e.context_json ?? null;
  const eventCode = e.event_code ?? e.eventCode ?? e.id ?? null;
  const cameraCode = e.camera_code ?? e.cameraCode ?? null;
  const occurredAt = e.occurred_at ?? e.occurredAt ?? e.created_at ?? e.createdAt ?? null;
  const objectType = e.object_type ?? e.objectType ?? context?.objectType ?? null;
  const trackId = e.track_id ?? e.trackId ?? context?.trackId ?? null;
  const relatedAlertId = e.related_alert_code ?? e.relatedAlertCode ?? null;
  return {
    id: eventCode,
    eventCode,
    type: e.event_type ?? e.eventType ?? null,
    eventType: e.event_type ?? e.eventType ?? null,
    cameraId: cameraCode,
    camera: cameraCode,
    cameraName: e.camera_name ?? e.cameraName ?? null,
    location: null,
    objectType,
    trackId,
    severity: e.severity,
    riskScore: e.risk_score ?? e.riskScore ?? null,
    confidence: e.confidence,
    status: e.status,
    timestamp: occurredAt,
    time: occurredAt,
    context,
    relatedAlertId,
    isProtected: Boolean(e.is_protected ?? e.isProtected),
    deletedAt: e.deleted_at ?? e.deletedAt ?? null,
    anpr: deriveAnpr(context, e),
    face: deriveFace(context, e),
    object: deriveObject(context, e),
  };
}

function buildQuery(params = {}) {
  // Map the UI's pageSize to the backend's limit param; drop empties.
  const out = { ...params };
  if (out.pageSize !== undefined) {
    out.limit = out.pageSize;
    delete out.pageSize;
  }
  const qs = new URLSearchParams(
    Object.entries(out).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return qs ? `?${qs}` : "";
}

// GET /api/events  -> { data: [event, ...] }
export function getEvents(params = {}) {
  return request(`/api/events${buildQuery(params)}`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapEvent),
    pagination: res.data?.pagination || {},
  }));
}

export function getEventsSummary() {
  return request("/api/events/summary").then((res) => ({
    ...res,
    data: {
      totalToday: Number(res.data?.totalToday || 0),
      securityEvents: Number(res.data?.securityEvents || 0),
      anprEvents: Number(res.data?.anprEvents || 0),
    },
  }));
}

// GET /api/events/:eventCode
export function getEventById(id) {
  return request(`/api/events/${id}`).then((res) => ({
    ...res,
    data: mapEvent(res.data?.event ?? res.data),
  }));
}

// DELETE /api/events/:eventCode  (Administrator) — soft delete with audit trail.
export function deleteEvent(id, data = {}) {
  return request(`/api/events/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ deletionReason: data.reason || data.deletionReason || null }),
  }).then((res) => ({
    ...res,
    data: mapEvent(res.data?.event ?? res.data),
  }));
}

export function protectEvent(id) {
  return request(`/api/events/${id}/protect`, { method: "POST", body: JSON.stringify({}) }).then((res) => ({
    ...res,
    data: mapEvent(res.data?.event ?? res.data),
  }));
}

export function unprotectEvent(id) {
  return request(`/api/events/${id}/unprotect`, { method: "POST", body: JSON.stringify({}) }).then((res) => ({
    ...res,
    data: mapEvent(res.data?.event ?? res.data),
  }));
}

// No related-events endpoint exists in the backend; resolves to an empty set so
// the UI simply omits the "related events" section.
export function getRelatedEvents() {
  return Promise.resolve({ success: true, data: [] });
}

// Adapter for realtime socket event payloads (camelCase from the server
// serializer) -> the view shape the event components use.
export function fromSocketEvent(p) {
  if (!p) return null;
  return {
    id: p.eventCode,
    eventCode: p.eventCode,
    type: p.eventType,
    eventType: p.eventType,
    cameraId: p.cameraCode || p.cameraId || null,
    camera: p.cameraCode || null,
    cameraName: null,
    location: null,
    objectType: p.objectType || null,
    trackId: null,
    severity: p.severity,
    riskScore: p.riskScore,
    confidence: null,
    status: p.status,
    timestamp: p.occurredAt || null,
    time: p.occurredAt || null,
    context: null,
    relatedAlertId: null,
    isProtected: Boolean(p.isProtected),
    deletedAt: p.deletedAt || null,
    anpr: undefined,
    face: undefined,
    object: undefined,
    evidence: [],
  };
}

// ---------- Evidence (snapshots / incident clips) ----------
const mapEvidence = (ev) => {
  if (!ev) return null;
  return {
    id: ev.evidence_code,
    type: ev.evidence_type,
    mimeType: ev.mime_type || null,
    fileSizeBytes: ev.file_size_bytes ?? null,
    checksum: ev.checksum || null,
    capturedAt: ev.captured_at || null,
    createdAt: ev.created_at || null,
    cameraCode: ev.camera_code || null,
    eventCode: ev.event_code || null,
    alertCode: ev.alert_code || null,
  };
};

// GET /api/events/:eventId/evidence
export function getEventEvidence(eventId) {
  return request(`/api/events/${eventId}/evidence`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapEvidence),
  }));
}

// GET /api/alerts/:alertId/evidence
export function getAlertEvidence(alertId) {
  return request(`/api/alerts/${alertId}/evidence`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapEvidence),
  }));
}

// Stream an evidence binary as an authenticated blob URL. The browser <img>
// cannot attach Authorization headers, so the file is fetched with the session
// token and rendered via a short-lived object URL.
export async function fetchEvidenceFileUrl(evidenceCode) {
  const token = getToken();
  const res = await fetch(buildUrl(`/api/evidence/${encodeURIComponent(evidenceCode)}/file`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Evidence fetch failed (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
