const http = require("http");
const app = require("./app");
const env = require("./config/env");
const { testDatabaseConnection, closeDatabasePool } = require("./config/database");
const { initializeSocket, getIO } = require("./realtime/socket");
const { startSchedulers, stop: stopSchedulers } = require("./services/scheduler.service");
const redis = require("./config/redis");
const logger = require("./utils/logger");

const PORT = env.PORT;
let server = null;

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);

  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed.");
      const io = getIO();
      if (io) {
        io.close(() => logger.info("Socket.IO server closed."));
      }
      try {
        await redis.closeRedis();
        await closeDatabasePool();
        stopSchedulers();
      } catch (err) {
        logger.error(`Error closing database pool: ${err.message}`);
      }
      logger.info("Exiting cleanly.");
      process.exit(0);
    });
  } else {
    try {
      await redis.closeRedis();
      await closeDatabasePool();
    } catch (err) {
      logger.error(`Error closing database pool: ${err.message}`);
    }
    process.exit(0);
  }

  setTimeout(() => {
    logger.error("Forced shutdown after timeout. Exiting.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  shutdown("uncaughtException");
});

const start = async () => {
  try {
    await testDatabaseConnection();
  } catch (err) {
    logger.error("Failed to connect to MySQL. Aborting startup.");
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  }

  server = http.createServer(app);

  // Attach Socket.IO to the SAME HTTP server (one port, one process).
  initializeSocket(server);

    server.listen(PORT, () => {
      logger.info("IBVAP API started");
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`Port: ${PORT}`);
      logger.info(`Database: ${env.DB.NAME} @ ${env.DB.HOST}:${env.DB.PORT}`);
      // Optional/degraded-by-design. Start the reconnecting client without
      // delaying HTTP startup; runtime requests fall back to Python meanwhile.
      if (redis.isEnabled()) redis.getClient();
      // Start background schedulers (retention + presence) after startup.
      startSchedulers();
    });
};

start();
