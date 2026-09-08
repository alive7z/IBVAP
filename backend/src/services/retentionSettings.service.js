const ApiError = require("../utils/ApiError");
const { parseBoolean, parseNumber } = require("../utils/validation");
const retentionRepository = require("../repositories/retention.repository");
const auditService = require("./audit.service");
const retentionService = require("./retention.service");
const logger = require("../utils/logger");

const getSettings = async () => {
  const settings = await retentionRepository.getSettings();
  if (!settings) {
    throw new ApiError(503, "Retention settings not initialized");
  }
  return settings;
};

const validateSettings = (body) => {
  const data = {};

  if (body.maxNormalEvents !== undefined) {
    data.maxNormalEvents = parseNumber(body.maxNormalEvents, "maxNormalEvents", { min: 0 });
  }
  if (body.normalEventHours !== undefined) {
    data.normalEventHours = parseNumber(body.normalEventHours, "normalEventHours", { min: 0 });
  }
  if (body.mediumEventHours !== undefined) {
    data.mediumEventHours = parseNumber(body.mediumEventHours, "mediumEventHours", { min: 0 });
  }
  if (body.highAlertHours !== undefined) {
    data.highAlertHours = parseNumber(body.highAlertHours, "highAlertHours", { min: 0 });
  }
  if (body.resolvedAlertHours !== undefined) {
    data.resolvedAlertHours = parseNumber(body.resolvedAlertHours, "resolvedAlertHours", { min: 0 });
  }
  if (body.criticalAlertHours !== undefined) {
    data.criticalAlertHours = parseNumber(body.criticalAlertHours, "criticalAlertHours", { min: 0 });
  }
  if (body.evidenceHours !== undefined) {
    data.evidenceHours = parseNumber(body.evidenceHours, "evidenceHours", { min: 0 });
  }
  if (body.cleanupIntervalMinutes !== undefined) {
    data.cleanupIntervalMinutes = parseNumber(body.cleanupIntervalMinutes, "cleanupIntervalMinutes", { min: 1 });
  }
  if (body.autoCleanupEnabled !== undefined) {
    data.autoCleanupEnabled = parseBoolean(body.autoCleanupEnabled, "autoCleanupEnabled");
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "No retention settings provided to update");
  }
  return data;
};

const updateSettings = async (body, actor) => {
  const current = await getSettings();
  const data = validateSettings(body);
  const merged = { ...current, ...data };

  const conn = await retentionRepository.beginTransaction();
  try {
    const updated = await retentionRepository.updateSettings(merged, actor.userId, conn);
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "RETENTION_UPDATED",
        entityType: "retention",
        entityId: String(retentionRepository.CANONICAL_ID),
        details: data,
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await retentionRepository.commit(conn);
    await require("./scheduler.service").rescheduleRetention();
    return updated;
  } catch (err) {
    await retentionRepository.rollback(conn);
    throw err;
  } finally {
    await retentionRepository.release(conn);
  }
};

const getRunStats = async () => {
  return retentionRepository.getRunStats ? await retentionRepository.getRunStats() : null;
};

const triggerCleanup = async (actor) => {
  const result = await retentionService.runRetentionCleanup({ mode: "manual" });
  await auditService.recordAudit({
    userId: actor.userId,
    action: "MANUAL_RETENTION_CLEANUP",
    entityType: "retention",
    entityId: String(retentionRepository.CANONICAL_ID),
    details: { mode: "manual", result },
    ipAddress: actor.ipAddress,
  });
  logger.info(`Retention run completed: ${JSON.stringify(result)}`);
  return result;
};

const cleanAllOperationalData = async (actor, confirmationPhrase) => {
  return require("./operationalCleanup.service").cleanAllOperationalData({
    actor,
    confirmationPhrase,
  });
};

module.exports = {
  getSettings,
  updateSettings,
  getRunStats,
  triggerCleanup,
  cleanAllOperationalData,
};
