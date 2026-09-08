const cameraRepository = require("../repositories/camera.repository");
const auditService = require("./audit.service");
const realtimeService = require("../realtime/realtime.service");
const redis = require("../config/redis");
const { handleDuplicate } = require("../utils/dbErrors");
const ApiError = require("../utils/ApiError");
const operatorRepository = require("../repositories/operator.repository");
const {
  assertRequired,
  assertOneOf,
  parseBoolean,
} = require("../utils/validation");

// Stream URL is stored server-side only (never serialized). Accept only
// explicit, well-formed sources; an empty/no value keeps the existing URL on
// update (it must never silently wipe the stored RTSP source).
const STREAM_URL_SCHEMES = ["rtsp:", "rtsps:", "http:", "https:"];
const normalizeStreamUrl = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const trimmed = String(value).trim();
  if (!STREAM_URL_SCHEMES.some((scheme) => trimmed.toLowerCase().startsWith(scheme))) {
    throw new ApiError(400, "streamUrl must start with rtsp://, rtsps://, http://, or https://");
  }
  return trimmed;
};

const ROTATION_DEGREES = [0, 90, 180, 270];
const normalizeRotationDegrees = (value) => {
  const degrees = Number(value);
  if (!Number.isInteger(degrees) || !ROTATION_DEGREES.includes(degrees)) {
    throw new ApiError(400, "rotationDegrees must be one of 0, 90, 180, or 270");
  }
  return degrees;
};

// Target processing FPS is optional; must be a positive number, capped to keep
// the AI engine from being asked to saturate on a low-power edge device.
const TARGET_FPS_MAX = 60;
const normalizeTargetFps = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0 || fps > TARGET_FPS_MAX) {
    throw new ApiError(400, `targetFps must be a number between 0 and ${TARGET_FPS_MAX}`);
  }
  return Math.round(fps * 100) / 100;
};

// Canonical application/service shape for every camera the API returns.
// Repository rows arrive snake_case (camera_code); normalizing HERE once means
// no caller ever mixes camera_code/cameraCode — preview tokens, runtime-status
// payloads, lists, and detail/update responses all agree on the same fields.
// stream_url is deliberately excluded: never serialized publicly.
const toSafeCamera = (camera) => {
  if (!camera) return null;
  return {
    id: camera.id,
    cameraCode: camera.camera_code,
    name: camera.name,
    description: camera.description || null,
    locationName: camera.location_name || null,
    sector: camera.sector || null,
    sourceType: camera.source_type || null,
    streamProtocol: camera.stream_protocol || null,
    targetFps: camera.target_fps === null || camera.target_fps === undefined ? null : Number(camera.target_fps),
    rotationDegrees: Number(camera.rotation_degrees || 0),
    streamStatus: camera.stream_status || null,
    aiStatus: camera.ai_status || null,
    enabled: Boolean(camera.enabled),
    deletedAt: camera.deleted_at || null,
    lastSeenAt: camera.last_seen_at || null,
    createdAt: camera.created_at || null,
    updatedAt: camera.updated_at || null,
  };
};
const listCameras = async (filters, actor) => {
  if (filters.status) {
    assertOneOf(filters.status, cameraRepository.CAMERA_STATUSES, "status");
  }
  if (filters.sourceType) {
    assertOneOf(filters.sourceType, cameraRepository.SOURCE_TYPES, "sourceType");
  }
  const enabled =
    filters.enabled !== undefined && filters.enabled !== ""
      ? parseBoolean(filters.enabled, "enabled")
      : filters.enabled;

  const operatorId = actor?.role === "SECURITY_OPERATOR" ? actor.userId : null;
  const result = await cameraRepository.findMany({ ...filters, enabled, operatorId });
  return {
    items: result.items.map(toSafeCamera),
    pagination: result.pagination,
  };
};

const assertCameraAccess = async (camera, actor) => {
  if (!actor || actor.role !== "SECURITY_OPERATOR") return;
  const assigned = await operatorRepository.findAssignment({
    operatorId: actor.userId,
    cameraId: camera.id,
  });
  if (!assigned) throw new ApiError(403, "Camera is not assigned to this operator");
};

const getCamera = async (cameraId, actor) => {
  const camera = await cameraRepository.findByCode(cameraId);
  if (!camera || camera.deleted_at) {
    throw new ApiError(404, "Camera not found");
  }
  await assertCameraAccess(camera, actor);
  return toSafeCamera(camera);
};

const createCamera = async (data, actor) => {
  assertRequired(data.cameraCode, "cameraCode is required");
  assertRequired(data.name, "name is required");

  const sourceType = data.sourceType || "IP_CAMERA";
  assertOneOf(sourceType, cameraRepository.SOURCE_TYPES, "sourceType");

  if (data.streamProtocol !== undefined && data.streamProtocol !== null) {
    assertOneOf(data.streamProtocol, cameraRepository.STREAM_PROTOCOLS, "streamProtocol");
  }

  if (data.streamUrl !== undefined && data.streamUrl !== null) {
    data.streamUrl = normalizeStreamUrl(data.streamUrl);
  }
  if (data.targetFps !== undefined) {
    data.targetFps = normalizeTargetFps(data.targetFps);
  }
  if (data.rotationDegrees !== undefined) {
    data.rotationDegrees = normalizeRotationDegrees(data.rotationDegrees);
  }

  const enabled =
    data.enabled !== undefined ? parseBoolean(data.enabled, "enabled") : true;

  const payload = { ...data, sourceType, enabled };

  const conn = await cameraRepository.beginTransaction();
  try {
    const camera = await cameraRepository.create(payload, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "CAMERA_CREATED",
      entityType: "camera",
      entityId: camera.camera_code,
      details: { cameraCode: camera.camera_code, name: camera.name },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
    return toSafeCamera(camera);
  } catch (err) {
    await conn.rollback();
    return handleDuplicate(err, `Camera code ${data.cameraCode} already exists`);
  } finally {
    conn.release();
  }
};

const updateCamera = async (cameraId, data, actor) => {
  const existing = await cameraRepository.findByCode(cameraId);
  if (!existing || existing.deleted_at) {
    throw new ApiError(404, "Camera not found");
  }

  if (data.sourceType !== undefined && data.sourceType !== null) {
    assertOneOf(data.sourceType, cameraRepository.SOURCE_TYPES, "sourceType");
  }
  if (data.streamProtocol !== undefined && data.streamProtocol !== null) {
    assertOneOf(data.streamProtocol, cameraRepository.STREAM_PROTOCOLS, "streamProtocol");
  }
  if (data.streamStatus !== undefined && data.streamStatus !== null) {
    assertOneOf(data.streamStatus, cameraRepository.CAMERA_STATUSES, "streamStatus");
  }
  if (data.aiStatus !== undefined && data.aiStatus !== null) {
    assertOneOf(data.aiStatus, ["ACTIVE", "PAUSED", "ERROR", "NOT_CONFIGURED"], "aiStatus");
  }
  if (data.streamUrl !== undefined) {
    data.streamUrl = normalizeStreamUrl(data.streamUrl);
  }
  if (data.targetFps !== undefined) {
    data.targetFps = normalizeTargetFps(data.targetFps);
  }
  if (data.rotationDegrees !== undefined) {
    data.rotationDegrees = normalizeRotationDegrees(data.rotationDegrees);
  }
  if (data.enabled !== undefined) {
    data.enabled = parseBoolean(data.enabled, "enabled");
  }

  const conn = await cameraRepository.beginTransaction();
  let camera;
  try {
    camera = await cameraRepository.update(existing.id, data, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "CAMERA_UPDATED",
      entityType: "camera",
      entityId: camera.camera_code,
      details: { cameraCode: camera.camera_code },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Payload uses the canonical camelCase key (streamStatus); comparing the
  // snake_case variant would never match, so emit camera:status on real changes.
  const statusChanged =
    data.streamStatus !== undefined && data.streamStatus !== existing.stream_status;

  // Emit after the DB write + audit succeed (no rollback path here).
  if (statusChanged) {
    realtimeService.emitCameraStatus(camera);
  } else {
    realtimeService.emitCameraUpdated(camera);
  }
  return toSafeCamera(camera);
};

// Soft-delete a camera (keeps events/zones FK integrity + audit history).
// After deletion the camera is disabled and hidden from every list and lookup;
// its ephemeral runtime entry is cleared best-effort so the AI engine is no
// longer advertised as live.
const deleteCamera = async (cameraId, actor) => {
  const existing = await cameraRepository.findByCode(cameraId);
  if (!existing || existing.deleted_at) {
    throw new ApiError(404, "Camera not found");
  }

  const conn = await cameraRepository.beginTransaction();
  try {
    const removed = await cameraRepository.softDelete(existing.id, conn);
    if (!removed) throw new ApiError(404, "Camera not found");
    await auditService.recordAudit({
      userId: actor.userId,
      action: "CAMERA_DELETED",
      entityType: "camera",
      entityId: existing.camera_code,
      details: { cameraCode: existing.camera_code, name: existing.name },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await redis.clearCameraRuntime(existing.camera_code);

  const after = await cameraRepository.findByCode(existing.camera_code);
  realtimeService.emitCameraUpdated(toSafeCamera(after));

  return toSafeCamera(after);
};

module.exports = {
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  toSafeCamera,
  assertCameraAccess,
};
