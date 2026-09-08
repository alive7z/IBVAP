const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const cameraController = require("../controllers/camera.controller");
const zoneController = require("../controllers/zone.controller");

const router = Router();

router.use(authenticate);

router.get("/", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(cameraController.list));
router.get("/:cameraId/zones", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(zoneController.listByCamera));
router.get("/:cameraId", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(cameraController.detail));
router.get("/:cameraId/runtime-status", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(cameraController.runtimeStatus));
router.get("/:cameraId/preview-token", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR"), asyncHandler(cameraController.previewToken));
router.post("/", authorizeRoles("ADMINISTRATOR"), asyncHandler(cameraController.create));
router.patch("/:cameraId", authorizeRoles("ADMINISTRATOR"), asyncHandler(cameraController.update));
router.delete("/:cameraId", authorizeRoles("ADMINISTRATOR"), asyncHandler(cameraController.remove));

module.exports = router;
