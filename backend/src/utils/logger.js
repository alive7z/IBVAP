const env = require("../config/env");

const appendLine = (level, args) => {
  // eslint-disable-next-line no-console
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${new Date().toISOString()}] [${level.toUpperCase()}]`, ...args);
};

const logger = {
  info: (...args) => appendLine("info", args),
  warn: (...args) => appendLine("warn", args),
  error: (...args) => appendLine("error", args),
  debug: (...args) => {
    if (!env.isProduction()) {
      appendLine("debug", args);
    }
  },
};

module.exports = logger;
