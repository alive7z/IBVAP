const zoneRepository = require("../repositories/zone.repository");
const cameraRepository = require("../repositories/camera.repository");
const auditService = require("./audit.service");
const realtimeService = require("../realtime/realtime.service");
const { handleDuplicate } = require("../utils/dbErrors");
const ApiError = require("../utils/ApiError");
const {
  assertRequired,
  assertOneOf,
  parseBoolean,
  validateCoordinates,
} = require("../utils/validation");

const toSafeZone = (zone) => {
  if (!zone) return null;
  const { camera_id: _cid, ...safe } = zone;
  return safe;
};

const resolveOrValidateCamera = async (data) => {
  let cameraId = data.cameraId;
  if (data.cameraCode) {
    const camera = await cameraRepository.findByCode(data.cameraCode);
    if (!camera) {
      throw new ApiError(400, `Camera code ${data.cameraCode} not found`);
    }
    cameraId = camera.id;
  }
  if (cameraId !== undefined) {
    const camera = await cameraRepository.findById(cameraId);
    if (!camera) {
      throw new ApiError(400, "Camera not found");
    }
  }
  return cameraId;
};

const listZones = async (filters) => {
  let cameraCode;
  if (filters.cameraCode) {
    const camera = await cameraRepository.findByCode(filters.cameraCode);
    if (!camera) {
      throw new ApiError(404, "Camera not found");
    }
    cameraCode = filters.cameraCode;
  }
  if (filters.cameraId) {
    const camera = await cameraRepository.findById(filters.cameraId);
    if (!camera) {
      throw new ApiError(404, "Camera not found");
    }
  }
  if (filters.zoneType) {
    assertOneOf(filters.zoneType, zoneRepository.ZONE_TYPES, "zoneType");
  }
  if (filters.riskLevel) {
    assertOneOf(filters.riskLevel, zoneRepository.RISK_LEVELS, "riskLevel");
  }
  const enabled =
    filters.enabled !== undefined && filters.enabled !== ""
      ? parseBoolean(filters.enabled, "enabled")
      : filters.enabled;

  const result = await zoneRepository.findMany({ ...filters, cameraCode, enabled });
  return {
    items: result.items.map(toSafeZone),
    pagination: result.pagination,
  };
};

const getZone = async (zoneCode) => {
  const zone = await zoneRepository.findByCode(zoneCode);
  if (!zone) {
    throw new ApiError(404, "Zone not found");
  }
  return toSafeZone(zone);
};

const listZonesByCamera = async (cameraId) => {
  const camera = await cameraRepository.findByCode(cameraId);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }
  const zones = await zoneRepository.findManyByCameraId(camera.id);
  return zones.map(toSafeZone);
};

const createZone = async (data, actor) => {
  assertRequired(data.zoneCode, "zoneCode is required");
  assertRequired(data.name, "name is required");

  const zoneType = data.zoneType || "MONITORING";
  assertOneOf(zoneType, zoneRepository.ZONE_TYPES, "zoneType");
  const riskLevel = data.riskLevel || "LOW";
  assertOneOf(riskLevel, zoneRepository.RISK_LEVELS, "riskLevel");

  const coordinates = validateCoordinates(data.coordinates, {
    minPoints: zoneType === "VIRTUAL_FENCE" ? 2 : 3,
  });
  const cameraId = await resolveOrValidateCamera(data);
  if (cameraId === undefined) {
    throw new ApiError(400, "cameraId or cameraCode is required");
  }
  const enabled = data.enabled !== undefined ? parseBoolean(data.enabled, "enabled") : true;

  const conn = await zoneRepository.beginTransaction();
  try {
    const zone = await zoneRepository.create({
      zoneCode: data.zoneCode,
      cameraId,
      name: data.name,
      zoneType,
      riskLevel,
      coordinates,
      enabled,
    }, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "ZONE_CREATED",
      entityType: "zone",
      entityId: zone.zone_code,
      details: { zoneCode: zone.zone_code, name: zone.name },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
    return toSafeZone(zone);
  } catch (err) {
    await conn.rollback();
    return handleDuplicate(err, `Zone code ${data.zoneCode} already exists`);
  } finally {
    conn.release();
  }
};

const updateZone = async (zoneCode, data, actor) => {
  const existing = await zoneRepository.findByCode(zoneCode);
  if (!existing) {
    throw new ApiError(404, "Zone not found");
  }

  if (data.zoneType !== undefined && data.zoneType !== null) {
    assertOneOf(data.zoneType, zoneRepository.ZONE_TYPES, "zoneType");
  }
  if (data.riskLevel !== undefined && data.riskLevel !== null) {
    assertOneOf(data.riskLevel, zoneRepository.RISK_LEVELS, "riskLevel");
  }
  if (data.coordinates !== undefined || data.zoneType !== undefined) {
    const effectiveType = data.zoneType || existing.zone_type;
    const effectiveCoordinates = data.coordinates ?? existing.coordinates;
    validateCoordinates(effectiveCoordinates, {
      minPoints: effectiveType === "VIRTUAL_FENCE" ? 2 : 3,
    });
  }
  if (data.enabled !== undefined) {
    data.enabled = parseBoolean(data.enabled, "enabled");
  }

  const conn = await zoneRepository.beginTransaction();
  let zone;
  try {
    zone = await zoneRepository.update(existing.id, data, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "ZONE_UPDATED",
      entityType: "zone",
      entityId: zone.zone_code,
      details: { zoneCode: zone.zone_code },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  realtimeService.emitZoneUpdated(zone);
  return toSafeZone(zone);
};

module.exports = {
  listZones,
  getZone,
  listZonesByCamera,
  createZone,
  updateZone,
  toSafeZone,
};
