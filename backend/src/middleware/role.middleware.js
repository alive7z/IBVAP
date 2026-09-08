const ApiError = require("../utils/ApiError");

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, "Insufficient role permissions"));
    }

    return next();
  };
};

module.exports = { authorizeRoles };
