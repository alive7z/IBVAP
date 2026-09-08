const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const intelligenceController = require("../controllers/intelligence.controller");

const router = Router();

router.use(authenticate);

router.get("/summary", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(intelligenceController.summary));
router.get("/overview", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(intelligenceController.summary));
router.get("/faces", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(intelligenceController.listFaces));
router.get("/vehicles", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(intelligenceController.listVehicles));
router.get("/plates", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(intelligenceController.listPlates));
router.get("/plates/:plateEventId", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(intelligenceController.plateDetail));

module.exports = router;
