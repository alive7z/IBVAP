const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const alertController = require("../controllers/alert.controller");
const evidenceController = require("../controllers/evidence.controller");

const router = Router();

router.use(authenticate);

const ALL = ["ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"];
const HANDLE = ["ADMINISTRATOR", "SECURITY_OPERATOR"];
const ADMIN = ["ADMINISTRATOR"];

router.get("/", authorizeRoles(...ALL), asyncHandler(alertController.list));
router.get("/summary", authorizeRoles(...ALL), asyncHandler(alertController.summary));
router.get("/:alertId/evidence", authorizeRoles(...ALL), asyncHandler(evidenceController.byAlert));
router.get("/:alertId", authorizeRoles(...ALL), asyncHandler(alertController.detail));
router.post("/:alertId/acknowledge", authorizeRoles(...HANDLE), asyncHandler(alertController.acknowledge));
router.post("/:alertId/investigate", authorizeRoles(...HANDLE), asyncHandler(alertController.investigate));
router.post("/:alertId/false-positive", authorizeRoles(...HANDLE), asyncHandler(alertController.falsePositive));
router.post("/:alertId/escalate", authorizeRoles(...HANDLE), asyncHandler(alertController.escalate));
router.post("/:alertId/resolve", authorizeRoles(...HANDLE), asyncHandler(alertController.resolve));
router.post("/:alertId/protect", authorizeRoles(...ADMIN), asyncHandler(alertController.protect));
router.post("/:alertId/unprotect", authorizeRoles(...ADMIN), asyncHandler(alertController.unprotect));
router.delete("/:alertId", authorizeRoles(...ADMIN), asyncHandler(alertController.remove));

module.exports = router;