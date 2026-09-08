const jwt = require("jsonwebtoken");
const env = require("../config/env");

const DEFAULT_EXPIRES_IN = "8h";

const getSecret = (secretOverride) => {
  return secretOverride || env.JWT.SECRET;
};

const generateAccessToken = (payload, options = {}) => {
  const secret = getSecret(options.secret);
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  const expiresIn = options.expiresIn || env.JWT.EXPIRES_IN || DEFAULT_EXPIRES_IN;
  return jwt.sign(payload, secret, { expiresIn });
};

const verifyAccessToken = (token, options = {}) => {
  const secret = getSecret(options.secret);
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.verify(token, secret);
};

module.exports = { generateAccessToken, verifyAccessToken };
