const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const authController = require("../controllers/auth.controller");

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.isProduction() ? 15 * 60 * 1000 : 5 * 60 * 1000,
  max: env.isProduction() ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
    data: null,
    errors: [],
  },
});

router.post("/login", loginLimiter, asyncHandler(authController.login));
router.get("/me", authenticate, asyncHandler(authController.me));
router.patch("/profile", authenticate, asyncHandler(authController.updateProfile));
router.post("/logout", authenticate, asyncHandler(authController.logout));

module.exports = router;
