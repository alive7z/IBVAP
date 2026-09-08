const { sendSuccess } = require("../utils/ApiResponse");
const aiObservationService = require("../services/aiObservation.service");

// POST /api/internal/ai/observations — internal AI service only.
const ingest = async (req, res) => {
  const result = await aiObservationService.ingestObservations(req.body);
  return sendSuccess(res, 200, "AI observations processed", result);
};

module.exports = { ingest };
