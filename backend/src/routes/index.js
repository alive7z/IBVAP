const { Router } = require("express");
const { sendSuccess } = require("../utils/ApiResponse");
const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const cameraRoutes = require("./camera.routes");
const zoneRoutes = require("./zone.routes");
const eventRoutes = require("./event.routes");
const alertRoutes = require("./alert.routes");
const evidenceRoutes = require("./evidence.routes");
const riskRuleRoutes = require("./riskRule.routes");
const intelligenceRoutes = require("./intelligence.routes");
const analyticsRoutes = require("./analytics.routes");
const auditRoutes = require("./audit.routes");
const operatorRoutes = require("./operator.routes");
const retentionRoutes = require("./retention.routes");
const systemRoutes = require("./system.routes");
const internalRoutes = require("./internal.routes");
const previewRoutes = require("./preview.routes");
const adminCleanupRoutes = require("./adminCleanup.routes");

const router = Router();

router.get("/", (req, res) => {
  const data = {
    version: "v1",
    status: "running",
  };
  return sendSuccess(res, 200, "IBVAP API", data);
});

router.use("/", healthRoutes);
router.use("/auth", authRoutes);
router.use("/cameras", cameraRoutes);
router.use("/zones", zoneRoutes);
router.use("/events", eventRoutes);
router.use("/alerts", alertRoutes);
router.use("/evidence", evidenceRoutes);
router.use("/risk-rules", riskRuleRoutes);
router.use("/intelligence", intelligenceRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/operators", operatorRoutes);
router.use("/retention", retentionRoutes);
router.use("/system", systemRoutes);
router.use("/internal", internalRoutes);
router.use("/preview", previewRoutes);
router.use("/admin/cleanup", adminCleanupRoutes);

module.exports = router;
