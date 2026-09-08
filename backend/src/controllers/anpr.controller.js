const { sendSuccess } = require("../utils/ApiResponse");
const anprObservationService = require("../services/anprObservation.service");

// POST /api/internal/ai/anpr-observations — internal AI service only.
const ingestAnprObservations = async (req, res) => {
  const result = await anprObservationService.ingestAnprObservations(req.body);
  return sendSuccess(res, 200, "ANPR observations processed", result);
};

module.exports = { ingestAnprObservations };
