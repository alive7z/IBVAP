const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");

// Timing-safe comparison of the AI service token to prevent timing attacks.
const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

// Validates the internal AI service key. This is NOT user JWT auth; it is a
// dedicated service-to-service credential used only by the Python AI engine.
const authenticateAiService = (req, res, next) => {
  const configured = env.AI_SERVICE_TOKEN;
  const provided = req.headers["x-ibvap-ai-key"];

  if (!configured) {
    return next(new ApiError(500, "AI service token not configured"));
  }
  if (!provided || typeof provided !== "string") {
    return next(new ApiError(401, "Missing AI service token"));
  }
  if (!timingSafeEqual(provided, configured)) {
    return next(new ApiError(401, "Invalid AI service token"));
  }

  req.aiService = { source: "AI_ENGINE" };
  return next();
};

module.exports = { authenticateAiService };
