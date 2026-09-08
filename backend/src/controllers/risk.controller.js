const { sendSuccess } = require("../utils/ApiResponse");
const riskConfigService = require("../services/riskConfig.service");
const riskObservationService = require("../services/riskObservation.service");

// GET /api/internal/ai/cameras/:code/risk-config — internal AI service only.
const getRiskConfig = async (req, res) => {
  const config = await riskConfigService.getCameraRiskConfig(req.params.code);
  return sendSuccess(res, 200, "Risk config fetched", config);
};

// POST /api/internal/ai/risk-observations — internal AI service only.
const ingestRiskObservations = async (req, res) => {
  const result = await riskObservationService.ingestRiskObservations(req.body);
  return sendSuccess(res, 200, "Risk observations processed", result);
};

module.exports = { getRiskConfig, ingestRiskObservations };
