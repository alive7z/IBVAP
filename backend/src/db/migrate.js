const fs = require("fs");
const path = require("path");
const { getPool, closeDatabasePool } = require("../config/database");
const logger = require("../utils/logger");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../database/migrations");

const ensureMigrationsTable = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      migration_name VARCHAR(255) NOT NULL,
      executed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_name (migration_name)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
};

const getAppliedMigrations = async (pool) => {
  const [rows] = await pool.query("SELECT migration_name FROM schema_migrations");
  return new Set(rows.map((r) => r.migration_name));
};

const recordMigration = async (pool, name) => {
  await pool.execute(
    "INSERT INTO schema_migrations (migration_name) VALUES (?)",
    [name]
  );
};

const run = async () => {
  const pool = getPool();
  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    logger.info(`Applying migration: ${file}`);
    try {
      await pool.query(sql);
      await recordMigration(pool, file);
      ran += 1;
    } catch (err) {
      if (err.code === "ER_DUP_FIELDNAME" && sql.includes("idempotent-duplicate-ok")) {
        logger.warn(`Migration already reflected in schema; recording ledger entry: ${file}`);
        await recordMigration(pool, file);
        continue;
      }
      logger.error(`Migration failed for ${file}: ${err.message}`);
      throw err;
    }
  }

  if (ran === 0) {
    logger.info("No pending migrations.");
  } else {
    logger.info(`Applied ${ran} migration(s).`);
  }
};

run()
  .then(() => closeDatabasePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Migration run failed:", err);
    closeDatabasePool().catch(() => {});
    process.exit(1);
  });
