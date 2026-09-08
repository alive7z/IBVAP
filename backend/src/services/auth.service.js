const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const jwtUtil = require("../utils/jwt");
const { comparePassword } = require("../utils/password");
const { toSafeUser } = require("../utils/userSerializer");
const userRepository = require("../repositories/user.repository");
const realtimeService = require("../realtime/realtime.service");
const auditService = require("./audit.service");

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const auditLogin = async ({ userId, success, ipAddress, email }) => {
  try {
    await userRepository.auditInsert({
      userId,
      action: success ? "LOGIN" : "LOGIN_FAILED",
      entityType: "user",
      entityId: userId ? String(userId) : null,
      details: { email },
      ipAddress,
    });
  } catch (err) {
    // Audit logging must never break authentication.
  }
};

const login = async ({ email, password, ipAddress }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new ApiError(400, "Email is required");
  }
  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  const user = await userRepository.findUserByEmail(normalizedEmail);

  const isPasswordValid =
    user && (await comparePassword(password, user.password_hash));

  if (!user || !isPasswordValid) {
    await auditLogin({ userId: user && user.id, success: false, ipAddress, email: normalizedEmail });
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.status !== "ACTIVE") {
    await auditLogin({ userId: user.id, success: false, ipAddress, email: normalizedEmail });
    throw new ApiError(403, "Account is not active");
  }

  await userRepository.updateLastLogin(user.id);
  const currentUser = await userRepository.findUserById(user.id);

  await auditLogin({ userId: user.id, success: true, ipAddress, email: normalizedEmail });

  const payload = {
    sub: user.public_id,
    userId: user.id,
    role: user.role,
  };
  const accessToken = jwtUtil.generateAccessToken(payload);
  const expiresIn = env.JWT.EXPIRES_IN || "8h";

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn,
    user: toSafeUser(currentUser),
  };
};

const getCurrentUser = async (sub) => {
  const user = await userRepository.findUserByPublicId(sub);

  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "Account is not active");
  }

  return toSafeUser(user);
};

// Self-service profile update. Only the signed-in user's own display name may
// change here; role/email/status are never editable through this endpoint.
// Returns the updated safe user.
const updateProfile = async ({ publicId }, body, actor) => {
  const fullName = body && (body.fullName ?? body.full_name ?? null);
  if (fullName === null || fullName === undefined) {
    throw new ApiError(400, "No profile fields provided to update");
  }
  if (typeof fullName !== "string" || fullName.trim() === "") {
    throw new ApiError(400, "fullName is required");
  }
  const trimmed = fullName.trim();
  if (trimmed.length > 120) {
    throw new ApiError(400, "fullName must be 120 characters or fewer");
  }

  const user = await userRepository.findUserByPublicId(publicId);
  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }
  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "Account is not active");
  }

  const conn = await userRepository.beginTransaction();
  let updated;
  try {
    updated = await userRepository.updateFullName({ userId: user.id, conn }, trimmed);
    await auditService.recordAudit({
      userId: user.id,
      action: "PROFILE_UPDATED",
      entityType: "user",
      entityId: user.public_id,
      details: { field: "fullName" },
      ipAddress: actor && actor.ipAddress,
    }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  realtimeService.emitProfileUpdated(updated);
  return toSafeUser(updated);
};

const logout = async (actor) => {
  await userRepository.auditInsert({
    userId: actor.userId,
    action: "LOGOUT",
    entityType: "user",
    entityId: actor.publicId,
    details: null,
    ipAddress: actor.ipAddress,
  });
};

module.exports = { login, getCurrentUser, updateProfile, logout };
