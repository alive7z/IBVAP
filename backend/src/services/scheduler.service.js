// Restart-safe background jobs. Retention uses a self-rearming timeout so each
// run reads the persisted interval; HIGH escalation is query based (no timer
// per alert); presence uses the one Socket.IO presence authority.
const logger = require("../utils/logger");
const env = require("../config/env");
const retentionService = require("./retention.service");
const alertService = require("./alert.service");
const { sweepStaleConnections } = require("../realtime/socket");
const retentionRepository = require("../repositories/retention.repository");

let retentionTimer = null;
let presenceTimer = null;
let escalationTimer = null;
let retentionRunning = false;
let escalationRunning = false;
let started = false;

const intervalFromSettings = (settings) =>
  Math.max(1, Number(settings?.cleanupIntervalMinutes || 60)) * 60 * 1000;

const runRetentionTick = async () => {
  if (retentionRunning) {
    logger.warn("Skipped retention tick: previous run still in progress");
    return;
  }
  retentionRunning = true;
  try {
    const result = await retentionService.runRetentionCleanup();
    logger.info(`Retention cleanup finished: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    logger.error(`Retention cleanup tick failed: ${err.message}`);
    return null;
  } finally {
    retentionRunning = false;
  }
};

const armRetention = async () => {
  if (!started) return null;
  if (retentionTimer) clearTimeout(retentionTimer);
  let intervalMs = 60 * 60 * 1000;
  try {
    intervalMs = intervalFromSettings(await retentionRepository.getSettings());
  } catch (err) {
    logger.warn(`Could not read retention settings: ${err.message}`);
  }
  retentionTimer = setTimeout(async () => {
    await runRetentionTick();
    await armRetention();
  }, intervalMs);
  retentionTimer.unref();
  return intervalMs;
};

const rescheduleRetention = async () => {
  if (!started) return null;
  return armRetention();
};

const sweepPresence = async () => {
  try {
    const flipped = await sweepStaleConnections();
    if (flipped > 0) {
      logger.info(`Presence sweep flipped ${flipped} stale connection(s) to OFFLINE`);
    }
  } catch (err) {
    logger.error(`Presence sweep failed: ${err.message}`);
  }
};

const escalateHighAlerts = async () => {
  if (escalationRunning) return;
  escalationRunning = true;
  try {
    const result = await alertService.escalateOverdueHighAlerts(
      env.HIGH_ALERT_ESCALATION_SECONDS
    );
    if (result.escalatedCount > 0) {
      logger.info(`Escalated ${result.escalatedCount} overdue HIGH alert(s)`);
    }
  } catch (err) {
    logger.error(`HIGH alert escalation failed: ${err.message}`);
  } finally {
    escalationRunning = false;
  }
};

const stop = () => {
  started = false;
  if (retentionTimer) clearTimeout(retentionTimer);
  if (presenceTimer) clearInterval(presenceTimer);
  if (escalationTimer) clearInterval(escalationTimer);
  retentionTimer = null;
  presenceTimer = null;
  escalationTimer = null;
};

const startSchedulers = async () => {
  stop();
  started = true;
  const intervalMs = await armRetention();
  presenceTimer = setInterval(sweepPresence, 60 * 1000);
  presenceTimer.unref();
  escalationTimer = setInterval(escalateHighAlerts, 5 * 1000);
  escalationTimer.unref();
  logger.info(
    `Schedulers started (retention=${Math.round(intervalMs / 60000)}m, presence=1m, HIGH escalation=5s)`
  );
  return [retentionTimer, presenceTimer, escalationTimer];
};

module.exports = {
  startSchedulers,
  stop,
  runRetentionTick,
  rescheduleRetention,
  sweepPresence,
  escalateHighAlerts,
};
