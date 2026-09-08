const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const systemController = require("../controllers/system.controller");

const router = Router();

router.use(authenticate);

router.get("/status", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(systemController.status));

module.exports = router;
