const ApiError = require("./ApiError");

const assertRequired = (value, message) => {
  if (value === undefined || value === null || value === "") {
    throw new ApiError(400, message);
  }
  return value;
};

const parseBoolean = (value, field) => {
  if (value === undefined || value === null) return undefined;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new ApiError(400, `Invalid boolean for ${field}`);
};

const parseNumber = (value, field, { min, max } = {}) => {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ApiError(400, `Invalid number for ${field}`);
  }
  if (min !== undefined && n < min) {
    throw new ApiError(400, `${field} must be >= ${min}`);
  }
  if (max !== undefined && n > max) {
    throw new ApiError(400, `${field} must be <= ${max}`);
  }
  return n;
};

const assertOneOf = (value, allowed, field) => {
  if (!allowed.includes(value)) {
    throw new ApiError(400, `Invalid ${field}: must be one of ${allowed.join(", ")}`);
  }
};

const validateCoordinates = (coordinates, { minPoints = 3 } = {}) => {
  if (!Array.isArray(coordinates) || coordinates.length < minPoints) {
    throw new ApiError(
      400,
      `coordinates must be an array of at least ${minPoints} points`
    );
  }

  const valid = coordinates.every((point) => {
    if (!point || typeof point !== "object") return false;
    const { x, y } = point;
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x < 0 || x > 1 || y < 0 || y > 1) return false;
    return true;
  });

  if (!valid) {
    throw new ApiError(400, "Each coordinate point must have numeric x/y between 0 and 1");
  }

  return coordinates;
};

module.exports = {
  assertRequired,
  parseBoolean,
  parseNumber,
  assertOneOf,
  validateCoordinates,
};
