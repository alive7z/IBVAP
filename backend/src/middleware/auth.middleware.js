const ApiError = require("../utils/ApiError");
const jwtUtil = require("../utils/jwt");
const userRepository = require("../repositories/user.repository");

const extractBearerToken = (req) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token.trim();
};

const authenticate = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    return next(new ApiError(401, "Authentication required"));
  }

  let payload;
  try {
    payload = jwtUtil.verifyAccessToken(token);
  } catch (err) {
    return next(new ApiError(401, "Invalid or expired token"));
  }

  const user = await userRepository.findUserById(payload.userId);

  if (!user) {
    return next(new ApiError(401, "User no longer exists"));
  }

  if (user.status !== "ACTIVE") {
    return next(new ApiError(403, "Account is not active"));
  }

  req.user = {
    publicId: user.public_id,
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  };

  return next();
};

module.exports = { authenticate };
