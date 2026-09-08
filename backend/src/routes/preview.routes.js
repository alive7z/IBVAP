const { Router } = require("express");
const env = require("../config/env");
const previewService = require("../services/preview.service");

const router = Router();

// GET /api/preview/:token — token-authenticated MJPEG proxy from the Python AI
// service. Public by design (a browser <img> cannot send Authorization headers),
// but only reachable with a valid short-lived HMAC token. The browser only ever
// receives the proxied MJPEG — never raw RTSP or camera credentials.
router.get("/:token", (req, res) => {
  const cameraCode = previewService.resolveToken(req.params.token);
  if (!cameraCode) {
    return res.status(401).json({ success: false, message: "Invalid or expired preview token" });
  }
  if (!env.PREVIEW_ENABLED) {
    return res.status(404).json({ success: false, message: "Preview disabled" });
  }
  const result = previewService.proxyMJPEG(res, cameraCode);
  if (!result.started && !res.headersSent) {
    return res.status(502).json({ success: false, message: "Preview unavailable" });
  }
  return undefined;
});

module.exports = router;
