const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticateAiService } = require("../middleware/aiService.middleware");
const { ingest } = require("../controllers/aiObservation.controller");
const {
  getContextConfig,
  ingestContextObservations,
} = require("../controllers/context.controller");
const {
  getRiskConfig,
  ingestRiskObservations,
} = require("../controllers/risk.controller");
const { ingestEvidence } = require("../controllers/evidence.controller");
const { ingestAnprObservations } = require("../controllers/anpr.controller");
const { ingestFaceObservations } = require("../controllers/face.controller");
const { getSourceConfig } = require("../controllers/sourceConfig.controller");

const router = Router();

// INTERNAL AI SERVICE ONLY. Not a public/frontend endpoint.
// Protected by a dedicated service-to-service token (X-IBVAP-AI-Key).
router.post(
  "/ai/observations",
  authenticateAiService,
  asyncHandler(ingest)
);

// Phase 9 — camera context config (zones/fences) for the AI Context Engine.
router.get(
  "/ai/cameras/:code/context-config",
  authenticateAiService,
  asyncHandler(getContextConfig)
);

// Phase 9 — context evidence observations (INFO events only, no alerts).
router.post(
  "/ai/context-observations",
  authenticateAiService,
  asyncHandler(ingestContextObservations)
);

// Phase 10 — camera risk config (risk rules + severity thresholds) for the AI Risk Engine.
router.get(
  "/ai/cameras/:code/risk-config",
  authenticateAiService,
  asyncHandler(getRiskConfig)
);

// Phase 10 — risk observations (SUSPICIOUS_ACTIVITY events, no alerts).
router.post(
  "/ai/risk-observations",
  authenticateAiService,
  asyncHandler(ingestRiskObservations)
);

// Phase 11 — evidence metadata reported by the AI engine for qualifying alerts.
// Alert creation already happened; this is best-effort and never cancels it.
router.post(
  "/ai/evidence",
  authenticateAiService,
  asyncHandler(ingestEvidence)
);

// Phase 12 — confirmed license-plate observations (PLATE_DETECTED INFO events +
// plate rows). Observational OCR only; never an alert, never risk.
router.post(
  "/ai/anpr-observations",
  authenticateAiService,
  asyncHandler(ingestAnprObservations)
);

// Phase 12 — confirmed face-detection observations (FACE_DETECTED INFO events).
// Detection-only; never identity, never an alert, never risk.
router.post(
  "/ai/face-observations",
  authenticateAiService,
  asyncHandler(ingestFaceObservations)
);

// Phase 13 — camera live source config (stream URL + transport) for the AI
// engine. Only this trusted internal route returns stream_url; public APIs strip
// it in camera.service.toSafeCamera. Python never queries MySQL directly.
router.get(
  "/ai/cameras/:code/source-config",
  authenticateAiService,
  asyncHandler(getSourceConfig)
);

module.exports = router;
