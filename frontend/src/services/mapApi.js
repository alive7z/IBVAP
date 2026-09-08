import request from "./api";

async function getAllItems(path) {
  const first = await request(`${path}?page=1&limit=100`);
  const totalPages = Number(first.data?.pagination?.totalPages || 0);
  const remaining = totalPages > 1
    ? await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        request(`${path}?page=${index + 2}&limit=100`)
      )
    )
    : [];
  return [first, ...remaining].flatMap((response) => response.data?.items || []);
}

// Map datasets reuse the shared domain endpoints (the backend has no dedicated
// /api/map route). Only explicitly geographic fields are accepted here. The
// ordinary zone `coordinates` field is deliberately ignored because it is a
// normalized CCTV-frame boundary, not latitude/longitude.
const finiteLatitude = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= -90 && number <= 90 ? number : null;
};
const finiteLongitude = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= -180 && number <= 180 ? number : null;
};

function geographicPoint(record) {
  const lat = finiteLatitude(
    record?.latitude ?? record?.lat ?? record?.geo_latitude ?? record?.geoLatitude
  );
  const lng = finiteLongitude(
    record?.longitude ?? record?.lng ?? record?.geo_longitude ?? record?.geoLongitude
  );
  return lat === null || lng === null ? { lat: null, lng: null } : { lat, lng };
}

function geographicBoundary(record) {
  const raw = record?.geographic_coordinates ?? record?.geoCoordinates ?? null;
  if (!Array.isArray(raw)) return null;
  const points = raw.map((point) => {
    if (Array.isArray(point) && point.length >= 2) {
      const lat = finiteLatitude(point[0]);
      const lng = finiteLongitude(point[1]);
      return lat === null || lng === null ? null : [lat, lng];
    }
    const { lat, lng } = geographicPoint(point);
    return lat === null || lng === null ? null : [lat, lng];
  });
  return points.length > 0 && points.every(Boolean) ? points : null;
}

function mapCameraForMap(c) {
  const { lat, lng } = geographicPoint(c);
  return {
    id: c.cameraCode,
    name: c.name,
    location: c.locationName || c.name,
    sector: c.sector || null,
    status: c.streamStatus === "ONLINE" ? "online" : "offline",
    risk: null,
    severity: null,
    activeAlert: null,
    lastUpdate: c.lastSeenAt || null,
    lastSeen: c.lastSeenAt || null,
    detections: [],
    lat,
    lng,
  };
}

function mapAlertForMap(a) {
  const { lat, lng } = geographicPoint(a);
  return {
    id: a.alert_code,
    type: a.alert_type,
    severity: a.severity,
    status: a.status,
    riskScore: a.risk_score,
    cameraId: a.camera_code || a.camera_id,
    camera: a.camera_code || a.camera_id,
    sector: null,
    lat,
    lng,
    timestamp: a.created_at,
  };
}

function mapZoneForMap(z) {
  return {
    id: z.zone_code,
    name: z.name,
    type: z.zone_type,
    cameraId: z.camera_code || z.camera_id,
    riskLevel: z.risk_level,
    coordinates: geographicBoundary(z),
  };
}

// GET /api/cameras (reused for the map marker layer)
export async function getMapCameras() {
  const items = await getAllItems("/api/cameras");
  return {
    success: true,
    data: items.map(mapCameraForMap),
  };
}

// GET /api/alerts (reused for the map alert layer)
export async function getMapAlerts() {
  const items = await getAllItems("/api/alerts");
  return {
    success: true,
    data: items
      .filter((alert) => ["NEW", "ACTIVE"].includes(String(alert.status || "").toUpperCase()))
      .map(mapAlertForMap),
  };
}

// GET /api/zones  (polygon restricted zones)
export async function getZones() {
  const items = await getAllItems("/api/zones");
  return {
    success: true,
    data: items
      .filter((zone) => zone.zone_type !== "VIRTUAL_FENCE")
      .map(mapZoneForMap),
  };
}

// Virtual fences share /api/zones. They render only when an explicit geographic
// boundary exists; normalized camera-frame points never reach Leaflet.
export async function getVirtualFences() {
  const items = await getAllItems("/api/zones");
  return {
    success: true,
    data: items
      .filter((zone) => zone.zone_type === "VIRTUAL_FENCE")
      .map(mapZoneForMap),
  };
}

// No sectors endpoint exists; honest empty set.
export function getMapSectors() {
  return Promise.resolve({ success: true, data: [] });
}

// Convenience: fetch everything the map needs in one shot (resolves to the raw
// bundle the BorderMap consumes directly). Each dataset is normalized into an
// array so the page never has to guess; a failure in one dataset stays isolated
// rather than blanking the whole map.
export async function getBorderMapData() {
  const settled = await Promise.allSettled([
    getMapCameras(),
    getMapAlerts(),
    getZones(),
    getVirtualFences(),
    getMapSectors(),
  ]);
  const pick = (i, fallback) => (settled[i].status === "fulfilled" ? settled[i].value.data : fallback);
  if (settled.slice(0, 3).every((result) => result.status === "rejected")) {
    throw new Error("Unable to load geographic map data");
  }
  const cameras = pick(0, []);
  const alerts = pick(1, []).map((alert) => {
    if (alert.lat !== null && alert.lng !== null) return alert;
    const camera = cameras.find((item) => item.id === alert.cameraId);
    return camera && camera.lat !== null && camera.lng !== null
      ? { ...alert, lat: camera.lat, lng: camera.lng, sector: camera.sector }
      : alert;
  });
  return {
    cameras,
    alerts,
    zones: pick(2, []),
    fences: pick(3, []),
    sectors: pick(4, []),
  };
}
