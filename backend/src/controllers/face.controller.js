const { sendSuccess } = require("../utils/ApiResponse");
const faceObservationService = require("../services/faceObservation.service");

// POST /api/internal/ai/face-observations — internal AI service only.
const ingestFaceObservations = async (req, res) => {
  const result = await faceObservationService.ingestFaceObservations(req.body);
  return sendSuccess(res, 200, "Face observations processed", result);
};

module.exports = { ingestFaceObservations };
