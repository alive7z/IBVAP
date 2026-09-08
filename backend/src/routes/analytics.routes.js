const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const analyticsController = require("../controllers/analytics.controller");

const router = Router();

router.use(authenticate);

router.get("/overview", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(analyticsController.overview));
router.get("/events", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(analyticsController.events));
router.get("/alerts", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(analyticsController.alerts));
router.get("/cameras", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(analyticsController.cameras));
router.get("/operators", authorizeRoles("ADMINISTRATOR"), asyncHandler(analyticsController.operators));

module.exports = router;
