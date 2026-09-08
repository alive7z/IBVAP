import request, { buildUrl } from "./api";
import { getToken } from "../utils/token";

const formatVehicleType = (value) => {
  if (!value) return null;
  if (String(value).toUpperCase() === "VEHICLE") return "Other";
  const lower = String(value).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

// Single mapper: backend plate (snake_case DB columns) -> the camelCase shape
// the Intelligence ANPR table expects.
function mapPlate(p) {
  if (!p) return null;
  return {
    id: p.id ?? p.plate_event_code,
    plateNumber: p.plateText ?? p.plate_text,
    rawText: p.rawText ?? p.raw_text ?? null,
    confidence: p.plateConfidence ?? p.ocr_confidence ?? null,
    vehicleType: formatVehicleType(p.vehicleType ?? p.vehicle_type),
    vehicleTrackId: p.trackId ?? p.vehicle_track_id ?? null,
    cameraId: p.cameraCode ?? p.camera_code ?? p.camera_id,
    cameraName: p.cameraName ?? p.camera_name ?? null,
    location: p.locationName ?? p.location_name ?? null,
    timestamp: p.timestamp ?? p.captured_at ?? null,
    bbox: p.bbox ?? null,
    relatedEventId: p.relatedEventId ?? p.event_code ?? null,
  };
}

function mapFace(f) {
  if (!f) return null;
  return {
    id: f.id,
    trackId: f.trackId ?? null,
    confidence: f.confidence ?? null,
    bbox: f.bbox ?? null,
    cameraId: f.cameraCode ?? null,
    cameraName: f.cameraName ?? null,
    location: f.locationName ?? null,
    sector: f.sector ?? null,
    timestamp: f.timestamp ?? null,
    evidenceId: f.evidenceId ?? null,
    relatedEventId: f.relatedEventId ?? f.id,
  };
}

function mapVehicle(v) {
  if (!v) return null;
  return {
    id: v.id,
    trackId: v.trackId ?? null,
    vehicleType: formatVehicleType(v.vehicleType) || "Other",
    confidence: v.confidence ?? null,
    bbox: v.bbox ?? null,
    cameraId: v.cameraCode ?? null,
    cameraName: v.cameraName ?? null,
    location: v.locationName ?? null,
    plateNumber: v.plateText ?? null,
    timestamp: v.timestamp ?? null,
    relatedEventId: v.relatedEventId ?? v.id,
  };
}

function buildQuery(params = {}) {
  const out = { ...params };
  if (out.camera && out.camera !== "all") out.cameraId = out.camera;
  if (out.pageSize !== undefined) out.limit = out.pageSize;
  delete out.pageSize;
  delete out.camera;
  return new URLSearchParams(
    Object.entries(out).filter(([, value]) => value !== undefined && value !== "" && value !== "all")
  ).toString();
}

// GET /api/intelligence/plates  -> { data: [anpr, ...], meta: { total } }
// FREE filters (search/plateText, cameraId, minConfidence, vehicleType) are
// mapped to backend params; UI "all"/empty values are dropped.
export function getANPREvents(params = {}) {
  const q = buildQuery({ ...params, plateText: params.search || undefined, search: undefined });
  return request(`/api/intelligence/plates${q ? `?${q}` : ""}`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapPlate),
    meta: { total: res.data?.pagination?.total ?? (res.data?.items || []).length },
  }));
}

export function getFaceEvents(params = {}) {
  const q = buildQuery(params);
  return request(`/api/intelligence/faces${q ? `?${q}` : ""}`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapFace),
    meta: res.data?.pagination || { total: 0 },
  }));
}

export function getVehicleEvents(params = {}) {
  const q = buildQuery(params);
  return request(`/api/intelligence/vehicles${q ? `?${q}` : ""}`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapVehicle),
    meta: res.data?.pagination || { total: 0 },
  }));
}

export function getIntelligenceSummary() {
  return request("/api/intelligence/summary").then((res) => ({
    ...res,
    data: {
      anprToday: Number(res.data?.anprToday || 0),
      faceDetectionsToday: Number(res.data?.faceDetectionsToday || 0),
      vehicleEventsToday: Number(res.data?.vehicleEventsToday || 0),
      activeCameras: Number(res.data?.activeCameras || 0),
      cameras: Array.isArray(res.data?.cameras) ? res.data.cameras : [],
      timezone: res.data?.timezone || "Asia/Kolkata",
    },
  }));
}

// GET /api/intelligence/plates/:eventCode
export function getANPREventById(id) {
  return request(`/api/intelligence/plates/${id}`).then((res) => ({
    ...res,
    data: mapPlate(res.data?.plate ?? res.data),
  }));
}

export async function getEvidenceBlob(evidenceId) {
  const token = getToken();
  const response = await fetch(buildUrl(`/api/evidence/${encodeURIComponent(evidenceId)}/file`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Evidence image unavailable");
  return response.blob();
}
