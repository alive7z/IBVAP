const { sendSuccess } = require("../utils/ApiResponse");
const contextConfigService = require("../services/contextConfig.service");
const contextObservationService = require("../services/contextObservation.service");

// GET /api/internal/ai/cameras/:code/context-config — internal AI service only.
const getContextConfig = async (req, res) => {
  const config = await contextConfigService.getCameraConfig(req.params.code);
  return sendSuccess(res, 200, "Context config fetched", config);
};

// POST /api/internal/ai/context-observations — internal AI service only.
const ingestContextObservations = async (req, res) => {
  const result = await contextObservationService.ingestContextObservations(req.body);
  return sendSuccess(res, 200, "Context observations processed", result);
};

module.exports = { getContextConfig, ingestContextObservations };
