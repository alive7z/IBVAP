const mysql = require("mysql2/promise");
const env = require("./env");
const logger = require("../utils/logger");

let pool = null;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB.HOST,
      port: env.DB.PORT,
      database: env.DB.NAME,
      user: env.DB.USER,
      password: env.DB.PASSWORD,
      waitForConnections: true,
      connectionLimit: env.DB.CONNECTION_LIMIT,
      charset: "utf8mb4",
      decimalNumbers: true,
      namedPlaceholders: true,
      timezone: "Z",
    });
    // MySQL's DATETIME defaults and SQL time functions use the session time
    // zone.  The host used for the demo runs in IST, while application dates
    // are serialized as UTC; without this, CURRENT_TIMESTAMP rows are 5h30m
    // ahead of UTC_TIMESTAMP lifecycle updates (for example acknowledge time
    // can appear earlier than alert creation).  Queue this as the first query
    // on every physical connection so storage and mysql2 serialization agree.
    pool.on("connection", (connection) => {
      connection.query("SET SESSION time_zone = '+00:00'", (err) => {
        if (err) logger.error(`Failed to set MySQL session time zone to UTC: ${err.message}`);
      });
    });
  }
  return pool;
};

const testDatabaseConnection = async () => {
  const conn = await getPool().getConnection();
  try {
    await conn.query("SELECT 1");
  } finally {
    conn.release();
  }
  logger.info("MySQL connection established");
};

const closeDatabasePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("MySQL connection pool closed");
  }
};

module.exports = { getPool, testDatabaseConnection, closeDatabasePool };
