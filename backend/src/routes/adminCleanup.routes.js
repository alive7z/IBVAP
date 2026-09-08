const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const retentionController = require("../controllers/retention.controller");

const router = Router();

router.use(authenticate);
router.post(
  "/all-operational-data",
  authorizeRoles("ADMINISTRATOR"),
  asyncHandler(retentionController.cleanAll)
);

module.exports = router;
