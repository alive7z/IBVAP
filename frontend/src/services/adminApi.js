import request from "./api";

async function getAllPages(path, mapItem) {
  const separator = path.includes("?") ? "&" : "?";
  const first = await request(`${path}${separator}page=1&limit=100`);
  const totalPages = Number(first.data?.pagination?.totalPages || 0);
  const remaining = totalPages > 1
    ? await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        request(`${path}${separator}page=${index + 2}&limit=100`)
      )
    )
    : [];
  return {
    ...first,
    data: [first, ...remaining]
      .flatMap((response) => response.data?.items || [])
      .map(mapItem),
  };
}

/**
 * Admin service layer. Wired to the real backend endpoints that exist. The
 * backend does NOT provide user management, system settings, role matrix,
 * audit logs, risk thresholds/config, per-camera connection-test, or camera
 * disable endpoints. Those functions resolve to honest empty/no-op results so
 * the UI degrades gracefully, and the corresponding controls are hidden.
 */

// ---------- Cameras (shared /api/cameras; ADMIN can create/update) ----------
const mapCam = (c) => {
  if (!c) return null;
  const row = c.camera || c;
  return {
    id: row.cameraCode,
    name: row.name,
    location: row.locationName || null,
    sector: row.sector || null,
    streamStatus: row.streamStatus,
    streamProtocol: row.streamProtocol,
    sourceType: row.sourceType,
    aiStatus: row.aiStatus,
    enabled: Boolean(row.enabled),
    targetFps: row.targetFps != null ? Number(row.targetFps) : null,
    rotationDegrees: Number(row.rotationDegrees || 0),
    deletedAt: row.deletedAt || null,
    description: row.description || null,
    rtspMasked: "rtsp://***.configured",
  };
};

export function getCameras() {
  return getAllPages("/api/cameras", mapCam);
}

export function createCamera(data) {
  const body = {
    cameraCode: data.id,
    name: data.name,
    locationName: data.location,
    sector: data.sector,
    description: data.description || null,
    sourceType: data.sourceType || "IP_CAMERA",
    streamProtocol: data.streamProtocol || "RTSP",
    streamUrl: data.rtspUrl || null,
    targetFps: data.targetFps != null ? Number(data.targetFps) : null,
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
  };
  return request("/api/cameras", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, data: mapCam(res.data) }));
}

export function updateCamera(id, data) {
  const body = {
    name: data.name,
    locationName: data.location,
    sector: data.sector,
    description: data.description || null,
  };
  if (data.targetFps != null) {
    body.targetFps = Number(data.targetFps);
  }
  if (typeof data.enabled === "boolean") {
    body.enabled = data.enabled;
  }
  if (data.sourceType) {
    body.sourceType = data.sourceType;
  }
  if (data.streamProtocol) {
    body.streamProtocol = data.streamProtocol;
  }
  // Blank means preserve the server-side secret. A non-blank replacement is
  // sent once and is never returned by the public API.
  if (data.rtspUrl && data.rtspUrl.trim()) {
    body.streamUrl = data.rtspUrl.trim();
  }
  return request(`/api/cameras/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, data: mapCam(res.data) }));
}

// Soft-delete a camera (backend marks deleted_at, disables streaming, and
// clears its runtime state).
export function deleteCamera(id) {
  return request(`/api/cameras/${id}`, {
    method: "DELETE",
  }).then((res) => ({ ...res, data: mapCam(res.data) }));
}

// No backend disable endpoint. Honest no-op preserving current state.
export function disableCamera(id) {
  return getCameras().then((res) => {
    const cam = (res.data || []).find((c) => c.id === id);
    return { ...res, data: cam || mapCam({ streamStatus: "DISABLED" }) };
  });
}

// No backend connection-test endpoint. Honest failed result.
export function testCameraConnection() {
  return Promise.resolve({
    success: true,
    data: { ok: false, message: "Connection testing is not available in this build." },
  });
}

// ---------- Zones (shared /api/zones; ADMIN can create/update) ----------
// Zones come back from the backend as UPPER types/risk; the admin UI renders
// title-case labels. Map in ONE place here.
const ZONE_TYPE_LABEL = {
  RESTRICTED: "Restricted Zone",
  MONITORING: "Monitoring Zone",
  VIRTUAL_FENCE: "Virtual Fence",
};
const ZONE_RISK_LABEL = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
const zoneTypeLabel = (v) => ZONE_TYPE_LABEL[v] || v;
const zoneRiskLabel = (v) => ZONE_RISK_LABEL[v] || v;
const zoneTypeKey = (v) =>
  v === "Restricted Zone" ? "RESTRICTED" : v === "Virtual Fence" ? "VIRTUAL_FENCE" : "MONITORING";
const zoneRiskKey = (v) =>
  v === "Low" ? "LOW" : v === "Medium" ? "MEDIUM" : v === "Critical" ? "CRITICAL" : "HIGH";

const mapZone = (z) => {
  if (!z) return null;
  const row = z.zone || z;
  return {
    id: row.zone_code,
    name: row.name,
    type: zoneTypeLabel(row.zone_type),
    riskLevel: zoneRiskLabel(row.risk_level),
    coordinates: row.coordinates || null,
    cameraId: row.camera_code || row.cameraCode || null,
    enabled: Boolean(row.enabled),
  };
};

function listZonesHelper() {
  return getAllPages("/api/zones", mapZone);
}

export function getZones() {
  return listZonesHelper();
}

export function createZone(data) {
  const body = {
    zoneCode: data.id,
    name: data.name,
    zoneType: zoneTypeKey(data.type),
    riskLevel: zoneRiskKey(data.riskLevel),
    cameraCode: data.cameraId,
    coordinates: data.coordinates || null,
    enabled: data.enabled !== false,
  };
  return request("/api/zones", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, data: mapZone(res.data) }));
}

export function updateZone(id, data) {
  const body = {
    name: data.name,
    zoneType: zoneTypeKey(data.type),
    riskLevel: zoneRiskKey(data.riskLevel),
    coordinates: data.coordinates,
  };
  return request(`/api/zones/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, data: mapZone(res.data) }));
}

// No backend zone-delete endpoint. Honest no-op.
export function deleteZone() {
  return Promise.resolve({ success: true, data: null });
}

// ---------- Risk rules (shared /api/risk-rules; ADMIN can update) ----------
const mapRule = (r) => {
  if (!r) return null;
  return {
    id: r.rule_code,
    ruleCode: r.rule_code,
    rule: r.name,
    name: r.name,
    description: r.description || null,
    category: r.category,
    weight: r.weight,
    confidenceThreshold: r.confidence_threshold,
    minimumDurationMs: r.minimum_duration_ms,
    cooldownSeconds: r.cooldown_seconds,
    enabled: Boolean(r.enabled),
    runtimeSupported: r.runtimeSupported !== false,
  };
};

export function getRiskRules() {
  return getAllPages("/api/risk-rules", mapRule);
}

export function updateRiskRule(id, data) {
  const body = {
    name: data.name || data.rule,
    description: data.description,
    category: data.category,
    weight: data.weight,
    confidenceThreshold: data.confidenceThreshold,
    minimumDurationMs: data.minimumDurationMs,
    cooldownSeconds: data.cooldownSeconds,
    enabled: data.enabled,
  };
  return request(`/api/risk-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, data: mapRule(res.data) }));
}

// No backend thresholds/config endpoints. Honest empty results.
export function getRiskThresholds() {
  return Promise.resolve({ success: true, data: { thresholds: [] } });
}
export function updateRiskThresholds() {
  return Promise.resolve({ success: true, data: { thresholds: [] } });
}
export function getRiskConfig() {
  return Promise.resolve({ success: true, data: {} });
}
export function updateRiskConfig(data) {
  return Promise.resolve({ success: true, data: data || {} });
}

// ---------- Users & roles (NOT provided by the backend) ----------
export function getUsers() {
  return Promise.resolve({ success: true, data: [] });
}
export function createUser(data) {
  return Promise.reject(new Error("User management is not available in this build."));
}
export function updateUser() {
  return Promise.reject(new Error("User management is not available in this build."));
}
export function deactivateUser() {
  return Promise.reject(new Error("User management is not available in this build."));
}
export function getRolePermissions() {
  return Promise.resolve({ success: true, data: {} });
}

// ---------- Settings & audit (NOT provided by the backend) ----------
export function getSystemSettings() {
  return Promise.reject(new Error("System settings are not available in this build."));
}
export function updateSystemSettings() {
  return Promise.reject(new Error("System settings are not available in this build."));
}
export function getAuditLogs() {
  return Promise.resolve({ success: true, data: [] });
}
