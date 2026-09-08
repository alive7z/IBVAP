const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const evidenceController = require("../controllers/evidence.controller");

const router = Router();

router.use(authenticate);

router.get("/:evidenceId/file", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(evidenceController.file));
router.get("/:evidenceId", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(evidenceController.detail));

module.exports = router;
