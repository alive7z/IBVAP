const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const retentionController = require("../controllers/retention.controller");

const router = Router();

router.use(authenticate);

// Settings view is read-only for operators/analysts; only ADMIN mutates.
router.get("/", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(retentionController.get));
router.put("/", authorizeRoles("ADMINISTRATOR"), asyncHandler(retentionController.update));
router.post("/run", authorizeRoles("ADMINISTRATOR"), asyncHandler(retentionController.run));

module.exports = router;