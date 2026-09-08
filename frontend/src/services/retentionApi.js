import request from "./api";

// GET /api/retention  -> { settings, stats }
export function getRetention() {
  return request("/api/retention").then((res) => ({
    ...res,
    data: {
      settings: mapSettings(res.data?.settings || {}),
      stats: res.data?.stats || {},
    },
  }));
}

// PUT /api/retention  -> { settings }
export function updateRetention(patch = {}) {
  return request("/api/retention", {
    method: "PUT",
    body: JSON.stringify(patch),
  }).then((res) => ({ ...res, data: { settings: mapSettings(res.data?.settings || {}) } }));
}

// POST /api/retention/run -> { result }
export function runRetention() {
  return request("/api/retention/run", { method: "POST", body: JSON.stringify({}) }).then(
    (res) => ({
      ...res,
      data: res.data?.result || {},
    })
  );
}

// POST /api/admin/cleanup/all-operational-data -> { result }
export function cleanAllOperationalData(confirmationPhrase) {
  return request("/api/admin/cleanup/all-operational-data", {
    method: "POST",
    body: JSON.stringify({ confirmationPhrase }),
  }).then((res) => ({
    ...res,
    data: res.data?.result || {},
  }));
}

function mapSettings(s) {
  return {
    maxNormalEvents: Number(s.maxNormalEvents ?? 400),
    normalEventHours: Number(s.normalEventHours ?? 48),
    mediumEventHours: Number(s.mediumEventHours ?? 72),
    highAlertHours: Number(s.highAlertHours ?? 168),
    resolvedAlertHours: Number(s.resolvedAlertHours ?? 168),
    criticalAlertHours: Number(s.criticalAlertHours ?? 0),
    evidenceHours: Number(s.evidenceHours ?? 168),
    autoCleanupEnabled: s.autoCleanupEnabled !== false && s.autoCleanupEnabled !== 0,
    cleanupIntervalMinutes: Number(s.cleanupIntervalMinutes ?? 60),
    updatedBy: s.updatedBy || s.updated_by || null,
    updatedAt: s.updatedAt || s.updated_at || null,
  };
}
