const fs = require("fs");
const { sendSuccess } = require("../utils/ApiResponse");
const evidenceService = require("../services/evidence.service");

const detail = async (req, res) => {
  const evidence = await evidenceService.getEvidence(req.params.evidenceId);
  return sendSuccess(res, 200, "Evidence retrieved", { evidence });
};

const byEvent = async (req, res) => {
  const items = await evidenceService.getEvidenceByEvent(req.params.eventId);
  return sendSuccess(res, 200, "Event evidence retrieved", { items });
};

const byAlert = async (req, res) => {
  const items = await evidenceService.getEvidenceByAlert(req.params.alertId);
  return sendSuccess(res, 200, "Alert evidence retrieved", { items });
};

// GET /api/evidence/:evidenceId/file — streams the stored evidence binary
// (snapshot/clip) to the authenticated browser. Media is never served by any
// public static route; only the confined path resolved from MySQL is streamed.
const file = async (req, res) => {
  const { absolute, mimeType, size } = await evidenceService.getEvidenceFile(
    req.params.evidenceId
  );
  res.set({
    "Content-Type": mimeType,
    "Content-Length": size,
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=60",
  });
  const stream = fs.createReadStream(absolute);
  stream.on("error", () => {
    res.setHeader("Content-Length", "0");
    if (!res.headersSent) res.status(404).end();
  });
  stream.pipe(res);
};

// POST /api/internal/ai/evidence — internal AI service only (Phase 11).
const ingestEvidence = async (req, res) => {
  const result = await evidenceService.ingestEvidence(req.body);
  return sendSuccess(res, 200, "Evidence metadata processed", result);
};

module.exports = { detail, byEvent, byAlert, file, ingestEvidence };
