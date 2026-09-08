const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const operatorController = require("../controllers/operator.controller");

const router = Router();

router.use(authenticate);

// Self-service analytics for the currently authenticated operator.
router.get(
  "/me/analytics",
  authorizeRoles("SECURITY_OPERATOR", "ADMINISTRATOR"),
  asyncHandler(operatorController.selfAnalytics)
);
router.post(
  "/",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.create)
);

// Admin management of operators.
router.get(
  "/",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.list)
);
router.get(
  "/analytics",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.analytics)
);
router.get(
  "/:operatorId",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.detail)
);
router.patch(
  "/:operatorId/enabled",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.setEnabled)
);
router.post(
  "/:operatorId/cameras",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.assignCameras)
);
router.delete(
  "/:operatorId/cameras",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(operatorController.unassignCameras)
);

module.exports = router;
