const morgan = require("morgan");
const env = require("../config/env");
const logger = require("../utils/logger");

const format = env.isProduction() ? "combined" : "dev";

const stream = {
  write: (message) => logger.info(message.trim()),
};

const requestLogger = morgan(format, { stream });

module.exports = requestLogger;
