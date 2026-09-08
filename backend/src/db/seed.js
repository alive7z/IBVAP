const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const env = require("../config/env");
const logger = require("../utils/logger");

const SEED_FILE = path.resolve(__dirname, "../../../database/seeds/demo_seed.sql");

const run = async () => {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }

  const sql = fs.readFileSync(SEED_FILE, "utf8");

  // Use a dedicated connection with multipleStatements enabled so the
  // multi-statement seed file runs atomically against the dev DB.
  const conn = await mysql.createConnection({
    host: env.DB.HOST,
    port: env.DB.PORT,
    database: env.DB.NAME,
    user: env.DB.USER,
    password: env.DB.PASSWORD,
    charset: "utf8mb4",
    multipleStatements: true,
    timezone: "Z",
  });

  try {
    logger.info("Seeding demo data...");
    await conn.query(sql);
    logger.info("Demo seed completed.");
  } finally {
    await conn.end();
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Seed run failed:", err);
    process.exit(1);
  });
