const crypto = require("crypto");
const { getPool, closeDatabasePool } = require("../config/database");
const logger = require("../utils/logger");
const { hashPassword } = require("../utils/password");

const SEED_USERS = [
  {
    emailVar: "DEV_ADMIN_PASSWORD",
    fullName: "Demo Administrator",
    email: "admin@ibvap.demo",
    role: "ADMINISTRATOR",
    status: "ACTIVE",
  },
  {
    emailVar: "DEV_OPERATOR_PASSWORD",
    fullName: "Demo Operator",
    email: "operator@ibvap.demo",
    role: "SECURITY_OPERATOR",
    status: "ACTIVE",
  },
  {
    emailVar: "DEV_AUDITOR_PASSWORD",
    fullName: "Demo Analyst",
    email: "analyst@ibvap.demo",
    role: "AUDITOR_ANALYST",
    status: "ACTIVE",
  },
];

const run = async () => {
  const pool = getPool();

  const missing = SEED_USERS.filter((u) => !process.env[u.emailVar]);
  if (missing.length > 0) {
    const names = missing.map((u) => `${u.emailVar} (${u.email})`).join(", ");
    logger.warn(
      `Skipping users without a supplied password. Set env var(s) to enable login: ${names}`
    );
  }

  for (const seed of SEED_USERS) {
    const password = process.env[seed.emailVar];
    if (!password) {
      continue;
    }

    const passwordHash = await hashPassword(password);
    const publicId = crypto.randomUUID();

    await pool.execute(
      `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         status = VALUES(status)`,
      [publicId, seed.fullName, seed.email, passwordHash, seed.role, seed.status]
    );

    logger.info(`Upserted login-enabled dev user: ${seed.email}`);
  }

  logger.info("User seed completed.");
};

run()
  .then(() => closeDatabasePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("User seed run failed:", err);
    closeDatabasePool().catch(() => {});
    process.exit(1);
  });
