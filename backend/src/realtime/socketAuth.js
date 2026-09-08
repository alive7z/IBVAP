const jwtUtil = require("../utils/jwt");
const userRepository = require("../repositories/user.repository");
const logger = require("../utils/logger");

// Authenticate a Socket.IO connection using the JWT sent in the handshake auth
// object ({ token }). Never uses a URL query param.
//
// On success, attaches a safe user context and the resolved DB role to the
// socket. On failure, rejects the connection cleanly (never crashes).
const socketAuthenticate = async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;

    if (!token || typeof token !== "string") {
      logger.warn("Socket auth failed: missing token");
      return next(new Error("Authentication required"));
    }

    let payload;
    try {
      payload = jwtUtil.verifyAccessToken(token);
    } catch (err) {
      logger.warn("Socket auth failed: invalid or expired token");
      return next(new Error("Invalid or expired token"));
    }

    // Resolve the current user from the database and use the LIVE DB role
    // (never trust a role embedded in the token).
    const user = await userRepository.findUserById(payload.userId);
    if (!user) {
      logger.warn("Socket auth failed: user no longer exists");
      return next(new Error("User no longer exists"));
    }
    if (user.status !== "ACTIVE") {
      logger.warn("Socket auth failed: account not active");
      return next(new Error("Account is not active"));
    }

    socket.user = {
      publicId: user.public_id,
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    return next();
  } catch (err) {
    // Defensive: an unexpected failure should reject, not crash the server.
    logger.error(`Socket auth error: ${err.message}`);
    return next(new Error("Authentication failed"));
  }
};

module.exports = { socketAuthenticate };
