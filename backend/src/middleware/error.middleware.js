const env = require("../config/env");
const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");
const { sendError } = require("../utils/ApiResponse");

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let errors = err.errors || [];

  if (err instanceof ApiError && err.isOperational) {
    logger.warn(`Operational error (${statusCode}): ${message}`);
  } else {
    logger.error(`Unhandled error: ${err.stack || err}`);
    if (statusCode === 500) {
      message = "Internal server error";
    }
  }

  if (env.isProduction()) {
    errors = [];
  }

  return sendError(res, statusCode, message, errors);
};

module.exports = errorHandler;
