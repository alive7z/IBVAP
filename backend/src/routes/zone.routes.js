const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const zoneController = require("../controllers/zone.controller");

const router = Router();

router.use(authenticate);

router.get("/", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(zoneController.list));
router.get("/:zoneId", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(zoneController.detail));
router.post("/", authorizeRoles("ADMINISTRATOR"), asyncHandler(zoneController.create));
router.patch("/:zoneId", authorizeRoles("ADMINISTRATOR"), asyncHandler(zoneController.update));

module.exports = router;
