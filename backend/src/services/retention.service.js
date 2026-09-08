// Retention job — periodic cleanup driven by the persisted retention_settings
// row. Protected rows and rows already deleted are excluded. Events and alerts
// are soft-deleted (deleted_at) to keep audit trails intact and avoid FK
// violations; evidence records that have lost every surviving parent are
// hard-deleted (DB row + file) only after the file deletion succeeded.
const path = require("path");
const fs = require("fs");
const { getPool } = require("../config/database");
const env = require("../config/env");
const retentionRepository = require("../repositories/retention.repository");
const evidenceRepository = require("../repositories/evidence.repository");
const auditService = require("./audit.service");

// Evidence binaries live under the repo's storage/ directory as confined
// relative paths (same convention as evidence.service).
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

let cleanupRunning = false;

const acquireCleanupLock = () => {
  if (cleanupRunning) return false;
  cleanupRunning = true;
  return true;
};

const releaseCleanupLock = () => {
  cleanupRunning = false;
};

const runRetentionCleanup = async ({ mode = "auto" } = {}) => {
  const start = Date.now();
  if (!acquireCleanupLock()) {
    return { skipped: true, reason: "cleanup_already_running", mode, durationMs: 0 };
  }
  try {
    const settings = await retentionRepository.getSettings();
    if (!settings) {
      return {
        skipped: true,
        reason: "retention_settings_missing",
        mode,
        durationMs: Date.now() - start,
      };
    }
    // Manual runs (Run Cleanup Now) always run; only the scheduler respects the
    // auto-cleanup switch.
    if (!settings.autoCleanupEnabled && mode !== "manual") {
      return {
        skipped: true,
        reason: "auto_cleanup_disabled",
        mode,
        durationMs: Date.now() - start,
      };
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const events = await purgeExpiredEvents(conn, settings);
      const alerts = await purgeExpiredAlerts(conn, settings);
      await conn.commit();
      const evidence = await purgeOrphanedEvidence(settings);
      const audit = { removedCount: 0 };
      if (env.AUDIT_LOG_MAX_ROWS > 0) {
        const result = await auditService.cleanupOldAuditLogs({
          keepCount: env.AUDIT_LOG_MAX_ROWS,
          actor: null,
        });
        audit.removedCount = result.removedCount;
      }

      return {
        skipped: false,
        mode,
        eventsRemoved: events.deletedEvents + events.capDeleted,
        deletedEvents: events.deletedEvents + events.capDeleted,
        perSeverity: events.perSeverity,
        normalCapDeleted: events.capDeleted,
        capDeleted: events.capDeleted,
        alertsRemoved: alerts.deletedAlerts,
        alertsPerSeverity: alerts.perSeverity,
        resolvedAlertsRemoved: alerts.resolvedRemoved,
        evidenceRemoved: evidence.removedCount,
        snapshotsRemoved: evidence.snapshotsRemoved,
        clipsRemoved: evidence.clipsRemoved,
        faceSnapshotsRemoved: evidence.faceSnapshotsRemoved,
        orphanRecordsRemoved: evidence.orphanRecordsRemoved,
        protectedSkipped: events.protectedSkipped + alerts.protectedSkipped,
        auditLogsRemoved: audit.removedCount,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } finally {
    releaseCleanupLock();
  }
};

// Events expire by severity age. HIGH/CRITICAL alerts have their own lifecycle
// (alerts) and are not purged as raw events unless they are ordinary NON-alert
// events. Events that back a live alert (NEW/ACTIVE/ACKNOWLEDGED/INVESTIGATING
// and not deleted) always survive so alert pages keep working. Protected events
// and the most recent N normal events always survive.
const purgeExpiredEvents = async (conn, settings) => {
  const ages = {
    INFO: settings.normalEventHours,
    LOW: settings.normalEventHours,
    MEDIUM: settings.mediumEventHours,
    HIGH: settings.highAlertHours,
    CRITICAL: settings.criticalAlertHours,
  };

  let deletedEvents = 0;
  const perSeverity = {};
  let protectedSkipped = 0;

  for (const severity of ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
    const hours = ages[severity];
    if (!hours || hours <= 0) {
      perSeverity[severity] = 0;
      continue;
    }
    const [[protectedRow]] = await conn.execute(
      `SELECT COUNT(*) AS count FROM events
        WHERE deleted_at IS NULL AND is_protected = 1 AND severity = ?
          AND occurred_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)`,
      [severity, hours]
    );
    protectedSkipped += Number(protectedRow.count || 0);
    const [result] = await conn.execute(
      `UPDATE events e
          SET e.deleted_at = UTC_TIMESTAMP(), e.deleted_by = NULL, e.deletion_reason = 'retention'
        WHERE e.deleted_at IS NULL
          AND e.is_protected = 0
          AND e.severity = ?
          AND e.occurred_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
             WHERE a.event_id = e.id
               AND a.deleted_at IS NULL
               AND a.status IN ('NEW','ACTIVE','ACKNOWLEDGED','INVESTIGATING')
          )`,
      [severity, hours]
    );
    perSeverity[severity] = result.affectedRows;
    deletedEvents += result.affectedRows;
  }

  const capDeleted = await applyNormalEventCap(conn, settings.maxNormalEvents);

  return { deletedEvents, perSeverity, capDeleted, protectedSkipped };
};

// Enforce the normal-event count cap: keep the most recent N non-protected,
// non-deleted normal events regardless of age (INFO/LOW only — HIGH/CRITICAL
// and events backing live alerts are never removed by the cap).
const applyNormalEventCap = async (conn, cap) => {
  if (!cap || cap <= 0) return 0;
  const [result] = await conn.execute(
    `UPDATE events e
        SET e.deleted_at = UTC_TIMESTAMP(), e.deleted_by = NULL, e.deletion_reason = 'retention_cap'
      WHERE e.deleted_at IS NULL
        AND e.is_protected = 0
        AND e.severity IN ('INFO','LOW')
        AND e.id NOT IN (
          SELECT keep.id FROM (
            SELECT id FROM events
             WHERE deleted_at IS NULL AND is_protected = 0 AND severity IN ('INFO','LOW')
             ORDER BY occurred_at DESC LIMIT ?
          ) keep
        )
        AND NOT EXISTS (
          SELECT 1 FROM alerts a
           WHERE a.event_id = e.id
             AND a.deleted_at IS NULL
             AND a.status IN ('NEW','ACTIVE','ACKNOWLEDGED','INVESTIGATING')
        )`,
    [cap]
  );
  return result.affectedRows;
};

// Alerts expire by status. Resolved/false-positive alerts purge quickly via
// resolvedAlertHours. Open alerts (NEW/ACTIVE/ACKNOWLEDGED/INVESTIGATING) are
// never purged by retention regardless of age. Protected alerts always survive.
const purgeExpiredAlerts = async (conn, settings) => {
  let deletedAlerts = 0;
  let resolvedRemoved = 0;
  const perSeverity = {};
  let protectedSkipped = 0;

  if (settings.resolvedAlertHours && settings.resolvedAlertHours > 0) {
    const [[protectedRow]] = await conn.execute(
      `SELECT COUNT(*) AS count FROM alerts
        WHERE deleted_at IS NULL AND is_protected = 1
          AND status IN ('RESOLVED','FALSE_POSITIVE')
          AND updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)`,
      [settings.resolvedAlertHours]
    );
    protectedSkipped += Number(protectedRow.count || 0);
    const [result] = await conn.execute(
      `UPDATE alerts a
          SET a.deleted_at = UTC_TIMESTAMP(), a.deleted_by = NULL, a.deletion_reason = 'retention'
        WHERE a.deleted_at IS NULL
          AND a.is_protected = 0
          AND a.status IN ('RESOLVED','FALSE_POSITIVE')
          AND a.updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)`,
      [settings.resolvedAlertHours]
    );
    resolvedRemoved = result.affectedRows;
    deletedAlerts += result.affectedRows;
  }

  for (const severity of ["MEDIUM", "HIGH", "CRITICAL"]) {
    perSeverity[severity] = 0;
  }

  return { deletedAlerts, resolvedRemoved, perSeverity, protectedSkipped };
};

// Escape hatch for removal: once evidence has lost every surviving parent
// (event and alert both deleted/missing) it is orphaned. Files are deleted
// BEFORE the DB row so a failed file delete keeps the row for a later retry.
// Missing files are tolerated (orphan record is still removed). Only orphans
// older than evidenceHours are eligible (0 = keep all orphans indefinitely).
const purgeOrphanedEvidence = async (settings) => {
  let removedCount = 0;
  let snapshotsRemoved = 0;
  let clipsRemoved = 0;
  let faceSnapshotsRemoved = 0;
  let orphanRecordsRemoved = 0;

  if (!settings.evidenceHours || settings.evidenceHours <= 0) {
    return { removedCount: 0, snapshotsRemoved: 0, clipsRemoved: 0, faceSnapshotsRemoved: 0, orphanRecordsRemoved: 0 };
  }

  const rows = await evidenceRepository.findOrphanedOlderThan(settings.evidenceHours);
  for (const row of rows) {
    let fileDeleted = true;
    if (row.file_path) {
      const absolute = path.resolve(REPO_ROOT, row.file_path);
      const relative = path.relative(REPO_ROOT, absolute);
      const confined = !(relative.startsWith("..") || path.isAbsolute(relative));
      try {
        if (confined && fs.existsSync(absolute)) {
          fs.rmSync(absolute, { force: true });
        } else if (!confined) {
          fileDeleted = false;
        }
      } catch (err) {
        fileDeleted = false;
      }
    }
    if (!fileDeleted) continue;

    try {
      await evidenceRepository.deleteById(row.id);
    } catch (err) {
      continue;
    }

    removedCount += 1;
    orphanRecordsRemoved += 1;
    if (row.evidence_type === "SNAPSHOT") snapshotsRemoved += 1;
    else if (row.evidence_type === "INCIDENT_CLIP") clipsRemoved += 1;
    else if (row.evidence_type === "FACE") faceSnapshotsRemoved += 1;
    else orphanRecordsRemoved += 0;
  }

  return { removedCount, snapshotsRemoved, clipsRemoved, faceSnapshotsRemoved, orphanRecordsRemoved };
};

module.exports = { runRetentionCleanup, acquireCleanupLock, releaseCleanupLock };
