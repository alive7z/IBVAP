const { getPool } = require("../config/database");

const mapSettings = (row) => {
  if (!row) return null;
  return {
    maxNormalEvents: Number(row.max_normal_events),
    normalEventHours: Number(row.normal_event_hours),
    mediumEventHours: Number(row.medium_event_hours),
    highAlertHours: Number(row.high_alert_hours),
    resolvedAlertHours: Number(row.resolved_alert_hours),
    criticalAlertHours: Number(row.critical_alert_hours),
    evidenceHours: Number(row.evidence_hours),
    autoCleanupEnabled: Boolean(row.auto_cleanup_enabled),
    cleanupIntervalMinutes: Number(row.cleanup_interval_minutes),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
};

const CANONICAL_ID = 1;

const getSettings = async (executor) => {
  const rows = await (executor || getPool()).execute(
    `SELECT id, max_normal_events, normal_event_hours, medium_event_hours,
            high_alert_hours, resolved_alert_hours, critical_alert_hours, evidence_hours,
            auto_cleanup_enabled, cleanup_interval_minutes, updated_by, updated_at
       FROM retention_settings WHERE id = ${CANONICAL_ID} LIMIT 1`
  );
  const row = rows[0][0] || null;
  return mapSettings(row);
};

const updateSettings = async (data, updatedBy, conn) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE retention_settings
        SET max_normal_events = ?, normal_event_hours = ?, medium_event_hours = ?,
            high_alert_hours = ?, resolved_alert_hours = ?, critical_alert_hours = ?,
            evidence_hours = ?, auto_cleanup_enabled = ?, cleanup_interval_minutes = ?,
            updated_by = ?
      WHERE id = ${CANONICAL_ID}`,
    [
      data.maxNormalEvents,
      data.normalEventHours,
      data.mediumEventHours,
      data.highAlertHours,
      data.resolvedAlertHours,
      data.criticalAlertHours,
      data.evidenceHours,
      data.autoCleanupEnabled,
      data.cleanupIntervalMinutes,
      updatedBy || null,
    ]
  );
  return getSettings(executor);
};

// Summary of current data volume to inform the Retention dashboard.
const getRunStats = async () => {
  const [[row]] = await getPool().execute(
    `SELECT
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL) AS events,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND severity='INFO') AS events_info,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND severity='LOW') AS events_low,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND severity='MEDIUM') AS events_medium,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND severity='HIGH') AS events_high,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND severity='CRITICAL') AS events_critical,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND severity IN ('INFO','LOW')) AS normal_events,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND is_protected = 1) AS protected_events,
       (SELECT COUNT(*) FROM alerts WHERE deleted_at IS NULL) AS alerts,
       (SELECT COUNT(*) FROM alerts WHERE deleted_at IS NULL AND severity='MEDIUM') AS alerts_medium,
       (SELECT COUNT(*) FROM alerts WHERE deleted_at IS NULL AND severity='HIGH') AS alerts_high,
       (SELECT COUNT(*) FROM alerts WHERE deleted_at IS NULL AND severity='CRITICAL') AS alerts_critical,
       (SELECT COUNT(*) FROM alerts WHERE deleted_at IS NULL AND is_protected = 1) AS protected_alerts,
       (SELECT COUNT(*) FROM evidence) AS evidence,
       (SELECT COUNT(*) FROM evidence WHERE evidence_type='SNAPSHOT') AS evidence_snapshots,
       (SELECT COUNT(*) FROM evidence WHERE evidence_type='INCIDENT_CLIP') AS evidence_clips,
       (SELECT COUNT(*) FROM evidence WHERE evidence_type='FACE') AS evidence_faces,
       (SELECT COUNT(file_size_bytes) FROM evidence) AS evidence_size_known,
       (SELECT SUM(file_size_bytes) FROM evidence) AS evidence_storage_bytes,
       (SELECT COUNT(*) FROM evidence ev
         WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id=ev.event_id AND e.deleted_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.id=ev.alert_id AND a.deleted_at IS NULL)) AS orphaned_evidence,
       (SELECT COUNT(*) FROM audit_logs) AS audit_logs`
  );
  return {
    events: Number(row.events || 0),
    eventsBySeverity: {
      INFO: Number(row.events_info || 0),
      LOW: Number(row.events_low || 0),
      MEDIUM: Number(row.events_medium || 0),
      HIGH: Number(row.events_high || 0),
      CRITICAL: Number(row.events_critical || 0),
    },
    normalEvents: Number(row.normal_events || 0),
    protectedEvents: Number(row.protected_events || 0),
    alerts: Number(row.alerts || 0),
    alertsBySeverity: {
      MEDIUM: Number(row.alerts_medium || 0),
      HIGH: Number(row.alerts_high || 0),
      CRITICAL: Number(row.alerts_critical || 0),
    },
    protectedAlerts: Number(row.protected_alerts || 0),
    evidence: Number(row.evidence || 0),
    evidenceByType: {
      SNAPSHOT: Number(row.evidence_snapshots || 0),
      INCIDENT_CLIP: Number(row.evidence_clips || 0),
      FACE: Number(row.evidence_faces || 0),
    },
    evidenceStorageBytes:
      Number(row.evidence_size_known || 0) > 0
        ? Number(row.evidence_storage_bytes || 0)
        : null,
    orphanedEvidence: Number(row.orphaned_evidence || 0),
    auditLogs: Number(row.audit_logs || 0),
  };
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};
const commit = async (conn) => conn.commit();
const rollback = async (conn) => conn.rollback();
const release = async (conn) => conn.release();

module.exports = {
  getSettings,
  updateSettings,
  getRunStats,
  beginTransaction,
  commit,
  rollback,
  release,
  CANONICAL_ID,
};
