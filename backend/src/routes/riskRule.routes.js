const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const riskRuleController = require("../controllers/riskRule.controller");

const router = Router();

router.use(authenticate);

router.get("/", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(riskRuleController.list));
router.get("/:ruleId", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(riskRuleController.detail));
router.post("/", authorizeRoles("ADMINISTRATOR"), asyncHandler(riskRuleController.create));
router.patch("/:ruleId", authorizeRoles("ADMINISTRATOR"), asyncHandler(riskRuleController.update));

module.exports = router;
