const auditRepository = require("../repositories/audit.repository");
const ApiError = require("../utils/ApiError");
const { parseDateRange } = require("../utils/datetime");
const env = require("../config/env");

const recordAudit = async (
  { userId, action, entityType, entityId, details, ipAddress },
  conn,
  { enforceCap = true } = {}
) => {
  if (!action) {
    return;
  }
  try {
    await auditRepository.create(
      { userId, action, entityType, entityId, details, ipAddress },
      conn
    );
    // Keep the cap invariant after every write, not only after the scheduled
    // cleanup. This also prevents a cleanup-summary or login audit from
    // leaving the table at max + 1 until the next scheduler tick.
    if (enforceCap) {
      await auditRepository.purgeOldest(env.AUDIT_LOG_MAX_ROWS, conn);
    }
  } catch (err) {
    // A caller that explicitly supplied a transaction requested atomicity:
    // surface the failure so the primary write can roll back with its audit.
    if (conn) throw err;
    // Best-effort standalone logging must never break the primary operation.
  }
};

const listAudits = async (filters) => {
  if (filters.userId !== undefined && filters.userId !== "" && filters.userId !== null) {
    filters.userId = Number(filters.userId);
    if (!Number.isInteger(filters.userId)) {
      throw new ApiError(400, "Invalid userId");
    }
  }

  let range;
  try {
    range = parseDateRange(filters);
  } catch (err) {
    if (err.isRangeError) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  const result = await auditRepository.findMany({ ...filters, ...range });
  return {
    items: result.items,
    pagination: result.pagination,
  };
};

const getAudit = async (auditId) => {
  const id = Number(auditId);
  if (!Number.isInteger(id)) {
    throw new ApiError(400, "Invalid audit id");
  }
  const audit = await auditRepository.findById(id);
  if (!audit) {
    throw new ApiError(404, "Audit log not found");
  }
  return audit;
};

const countAuditLogs = async () => auditRepository.count();

// Trim audit_logs to the configured maximum, keeping the newest rows. The
// cleanup record itself is a summary (no per-row audit echo). A single
// AUDIT_RETENTION_CLEANUP audit record is written only when rows were removed.
const cleanupOldAuditLogs = async ({ keepCount, actor }) => {
  if (!Number.isInteger(Number(keepCount)) || Number(keepCount) < 1) {
    throw new ApiError(400, "keepCount must be a positive integer");
  }
  keepCount = Number(keepCount);
  const beforeCount = await auditRepository.count();
  if (beforeCount <= keepCount) {
    return { beforeCount, afterCount: beforeCount, removedCount: 0 };
  }

  const conn = await auditRepository.beginTransaction();
  try {
    // Insert the one permitted summary first, then retain the newest keepCount
    // rows. This guarantees the summary itself never pushes the table to 2001.
    const expectedRemoved = beforeCount + 1 - keepCount;
    // Bypass recordAudit's global cap here because this operation may be
    // exercising a smaller explicit test/maintenance cap. The purge below is
    // part of the same transaction and includes this summary row.
    await auditRepository.create({
      userId: actor && actor.userId,
      action: "AUDIT_RETENTION_CLEANUP",
      entityType: "audit",
      entityId: "retention",
      details: {
        beforeCount,
        afterCount: keepCount,
        removedCount: expectedRemoved,
        keepCount,
      },
      ipAddress: actor && actor.ipAddress,
    }, conn);
    const removedCount = await auditRepository.purgeOldest(keepCount, conn);
    const afterCount = await auditRepository.count(conn);
    await conn.commit();
    return { beforeCount, afterCount, removedCount };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = { recordAudit, listAudits, getAudit, countAuditLogs, cleanupOldAuditLogs };
