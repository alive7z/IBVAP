const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const auditController = require("../controllers/audit.controller");

const router = Router();

router.use(authenticate);

router.get("/", authorizeRoles("ADMINISTRATOR", "AUDITOR_ANALYST"), asyncHandler(auditController.list));
router.get("/stats", authorizeRoles("ADMINISTRATOR", "AUDITOR_ANALYST"), asyncHandler(auditController.stats));
router.post("/cleanup", authorizeRoles("ADMINISTRATOR"), asyncHandler(auditController.cleanup));
router.get("/:auditId", authorizeRoles("ADMINISTRATOR", "AUDITOR_ANALYST"), asyncHandler(auditController.detail));

module.exports = router;
