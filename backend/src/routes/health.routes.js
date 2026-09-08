const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { getHealth } = require("../controllers/health.controller");

const router = Router();

router.get("/health", asyncHandler(getHealth));

module.exports = router;
