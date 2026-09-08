const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");

const login = async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
    ipAddress: req.ip,
  });
  return sendSuccess(res, 200, "Login successful", result);
};

const me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.publicId);
  return sendSuccess(res, 200, "Current user retrieved", { user });
};

const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(
    { publicId: req.user.publicId, userId: req.user.userId },
    req.body || {},
    getActor(req)
  );
  return sendSuccess(res, 200, "Profile updated", { user });
};

const logout = async (req, res) => {
  await authService.logout(getActor(req));
  return sendSuccess(res, 200, "Logout recorded", {});
};

module.exports = { login, me, updateProfile, logout };
