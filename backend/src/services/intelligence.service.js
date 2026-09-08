const intelligenceRepository = require("../repositories/intelligence.repository");
const ApiError = require("../utils/ApiError");
const { parseIntelligenceDateRange, indiaDayRange } = require("../utils/datetime");
const { parseNumber } = require("../utils/validation");

const toSafePlate = (plate) => {
  if (!plate) return null;
  return {
    id: plate.plate_event_code,
    plateText: plate.plate_text,
    rawText: plate.raw_text || null,
    plateConfidence: plate.ocr_confidence === null ? null : Number(plate.ocr_confidence),
    vehicleType: plate.vehicle_type || null,
    trackId: plate.vehicle_track_id || null,
    cameraCode: plate.camera_code || null,
    cameraName: plate.camera_name || null,
    locationName: plate.location_name || null,
    timestamp: plate.captured_at,
    relatedEventId: plate.event_code || null,
    bbox: parseJson(plate.plate_bbox),
  };
};

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
};

const toFace = (row) => {
  const context = parseJson(row.context_json) || {};
  return {
    id: row.event_code,
    cameraCode: row.camera_code || null,
    cameraName: row.camera_name || null,
    locationName: row.location_name || null,
    sector: row.sector || null,
    trackId: row.track_id || context.personTrackId || null,
    confidence: row.confidence === null ? null : Number(row.confidence),
    bbox: context.faceBBox || null,
    timestamp: row.occurred_at,
    evidenceId: row.evidence_code || null,
    relatedEventId: row.event_code,
  };
};

const toVehicle = (row) => {
  const context = parseJson(row.context_json) || {};
  return {
    id: row.event_code,
    cameraCode: row.camera_code || null,
    cameraName: row.camera_name || null,
    locationName: row.location_name || null,
    trackId: row.track_id || context.trackId || null,
    vehicleType: context.vehicleType || "VEHICLE",
    confidence: row.confidence === null ? null : Number(row.confidence),
    bbox: context.bbox || null,
    plateText: row.plate_text || null,
    timestamp: row.occurred_at,
    relatedEventId: row.event_code,
  };
};

const parseConfidence = (filters) => {
  const level = String(filters.confidence || "").toLowerCase();
  if (level === "high") return { minConfidence: 0.9, maxConfidence: undefined };
  if (level === "medium") return { minConfidence: 0.75, maxConfidence: 0.9 };
  if (level === "low") return { minConfidence: undefined, maxConfidence: 0.75 };

  const range = {};
  for (const key of ["minConfidence", "maxConfidence"]) {
    if (filters[key] !== undefined && filters[key] !== "" && filters[key] !== null) {
      range[key] = parseNumber(filters[key], key, { min: 0, max: 1 });
    }
  }
  if (
    range.minConfidence !== undefined &&
    range.maxConfidence !== undefined &&
    range.minConfidence >= range.maxConfidence
  ) {
    throw new ApiError(400, "minConfidence must be less than maxConfidence");
  }
  return range;
};

const normalizeFilters = (filters = {}) => {
  let range;
  try {
    range = parseIntelligenceDateRange(filters);
  } catch (err) {
    if (err.isRangeError) throw new ApiError(400, err.message);
    throw err;
  }
  return {
    ...filters,
    ...range,
    ...parseConfidence(filters),
    cameraId: filters.cameraId || filters.camera,
  };
};

const listPlates = async (filters) => {
  const result = await intelligenceRepository.findPlates(normalizeFilters(filters));
  return {
    items: result.items.map(toSafePlate),
    pagination: result.pagination,
  };
};

const listFaces = async (filters = {}) => {
  const result = await intelligenceRepository.findFaces(normalizeFilters(filters));
  return { items: result.items.map(toFace), pagination: result.pagination };
};

const listVehicles = async (filters = {}) => {
  const result = await intelligenceRepository.findVehicles(normalizeFilters(filters));
  return { items: result.items.map(toVehicle), pagination: result.pagination };
};

const getSummary = async () => intelligenceRepository.getSummary(indiaDayRange());

const getPlate = async (plateEventId) => {
  const plate = await intelligenceRepository.findByPlateEventCode(plateEventId);
  if (!plate) {
    throw new ApiError(404, "Plate record not found");
  }
  return toSafePlate(plate);
};

module.exports = { listPlates, listFaces, listVehicles, getSummary, getPlate };
