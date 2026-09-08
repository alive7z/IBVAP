const ApiError = require("../utils/ApiError");
const cameraRepository = require("../repositories/camera.repository");
const zoneRepository = require("../repositories/zone.repository");

// Build the context configuration consumed by the AI Context Intelligence
// Engine (Phase 9). Python NEVER queries MySQL directly — it fetches this
// payload over the internal service endpoint and caches it.
const getCameraConfig = async (cameraCode) => {
  if (!cameraCode) {
    throw new ApiError(400, "cameraCode is required");
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }

  const zoneRows = await zoneRepository.findManyByCameraId(camera.id);

  const zones = zoneRows
    .filter((z) => z.enabled !== false && Array.isArray(z.coordinates) && z.coordinates.length > 0)
    .map((z) => ({
      zoneCode: z.zone_code,
      name: z.name,
      zoneType: z.zone_type,
      enabled: true,
      coordinates: z.coordinates,
    }));

  return {
    cameraCode,
    zones,
  };
};

module.exports = { getCameraConfig };
