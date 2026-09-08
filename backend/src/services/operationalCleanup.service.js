const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getPool } = require("../config/database");
const ApiError = require("../utils/ApiError");
const auditService = require("./audit.service");
const retentionService = require("./retention.service");
const realtimeService = require("../realtime/realtime.service");
const logger = require("../utils/logger");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_STORAGE_ROOT = path.resolve(
  process.env.EVIDENCE_STORAGE_ROOT || path.join(REPO_ROOT, "storage")
);
const EVIDENCE_DIRECTORIES = Object.freeze({
  SNAPSHOT: "snapshots",
  INCIDENT_CLIP: "clips",
  FACE: "faces",
});

const isInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const assertSafeStorageRoot = (storageRoot) => {
  const resolved = path.resolve(storageRoot);
  if (resolved === path.parse(resolved).root || resolved === REPO_ROOT) {
    throw new Error("Evidence storage root is not safely scoped");
  }
  return resolved;
};

const collectFiles = (directory, approvedRoot, evidenceType, output) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.resolve(directory, entry.name);
    if (!isInside(approvedRoot, absolute)) {
      throw new Error("Evidence path escaped its approved directory");
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      collectFiles(absolute, approvedRoot, evidenceType, output);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const stat = fs.lstatSync(absolute);
      output.push({ absolute, approvedRoot, evidenceType, bytes: stat.size });
    }
  }
};

const restoreStagedFiles = (stage) => {
  if (!stage) return;
  for (const item of [...stage.items].reverse()) {
    try {
      if (!fs.existsSync(item.staged)) continue;
      if (fs.existsSync(item.absolute)) {
        logger.error(`Could not restore staged evidence because destination exists: ${item.absolute}`);
        continue;
      }
      fs.mkdirSync(path.dirname(item.absolute), { recursive: true });
      fs.renameSync(item.staged, item.absolute);
    } catch (err) {
      logger.error(`Could not restore staged evidence: ${err.message}`);
    }
  }
  try {
    if (fs.existsSync(stage.quarantine)) {
      fs.rmSync(stage.quarantine, { recursive: true, force: true });
    }
  } catch (err) {
    logger.error(`Could not remove cleanup quarantine after rollback: ${err.message}`);
  }
};

const stageEvidenceFiles = ({ storageRoot = DEFAULT_STORAGE_ROOT, cleanupId = crypto.randomUUID() } = {}) => {
  const root = assertSafeStorageRoot(storageRoot);
  if (!/^[0-9a-f-]{36}$/i.test(cleanupId)) {
    throw new Error("Invalid cleanup identifier");
  }
  const quarantineParent = path.resolve(root, ".cleanup");
  const quarantine = path.resolve(quarantineParent, cleanupId);
  if (!isInside(root, quarantine) || path.dirname(quarantine) !== quarantineParent) {
    throw new Error("Cleanup quarantine is not safely scoped");
  }

  const files = [];
  for (const [evidenceType, directoryName] of Object.entries(EVIDENCE_DIRECTORIES)) {
    const approvedRoot = path.resolve(root, directoryName);
    if (!isInside(root, approvedRoot)) {
      throw new Error("Evidence directory is not safely scoped");
    }
    collectFiles(approvedRoot, approvedRoot, evidenceType, files);
  }

  const stage = {
    cleanupId,
    storageRoot: root,
    quarantine,
    items: [],
    stats: {
      snapshotFiles: 0,
      clipFiles: 0,
      faceFiles: 0,
      totalFiles: 0,
      totalBytes: 0,
    },
  };

  try {
    for (const file of files) {
      const directoryName = EVIDENCE_DIRECTORIES[file.evidenceType];
      const relative = path.relative(file.approvedRoot, file.absolute);
      const staged = path.resolve(quarantine, directoryName, relative);
      if (!isInside(quarantine, staged)) {
        throw new Error("Staged evidence path escaped cleanup quarantine");
      }
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.renameSync(file.absolute, staged);
      stage.items.push({ ...file, staged });
      stage.stats.totalFiles += 1;
      stage.stats.totalBytes += Number(file.bytes || 0);
      if (file.evidenceType === "SNAPSHOT") stage.stats.snapshotFiles += 1;
      if (file.evidenceType === "INCIDENT_CLIP") stage.stats.clipFiles += 1;
      if (file.evidenceType === "FACE") stage.stats.faceFiles += 1;
    }
    return stage;
  } catch (err) {
    restoreStagedFiles(stage);
    throw new ApiError(500, "Unable to stage evidence files safely; no database data was deleted");
  }
};

const finalizeStagedFiles = (stage) => {
  if (!stage || !fs.existsSync(stage.quarantine)) return;
  const root = assertSafeStorageRoot(stage.storageRoot);
  const expectedParent = path.resolve(root, ".cleanup");
  if (!isInside(root, stage.quarantine) || path.dirname(stage.quarantine) !== expectedParent) {
    throw new Error("Refusing to remove an invalid cleanup quarantine");
  }
  fs.rmSync(stage.quarantine, { recursive: true, force: true });
  try {
    fs.rmdirSync(expectedParent);
  } catch (err) {
    if (err.code !== "ENOENT" && err.code !== "ENOTEMPTY") throw err;
  }
};

const snapshotCounts = async (executor) => {
  const [[row]] = await executor.execute(
    `SELECT
       (SELECT COUNT(*) FROM events) AS events,
       (SELECT COUNT(*) FROM alerts) AS alerts,
       (SELECT COUNT(*) FROM evidence) AS evidence,
       (SELECT COALESCE(SUM(file_size_bytes), 0) FROM evidence) AS evidence_bytes,
       (SELECT COUNT(*) FROM plates) AS plates,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM cameras) AS cameras,
       (SELECT COUNT(*) FROM zones) AS zones,
       (SELECT COUNT(*) FROM risk_rules) AS risk_rules,
       (SELECT COUNT(*) FROM retention_settings) AS retention_settings,
       (SELECT COUNT(*) FROM operator_camera_assignments) AS camera_assignments,
       (SELECT COUNT(*) FROM system_health) AS system_health,
       (SELECT COUNT(*) FROM audit_logs) AS audit_logs`
  );
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value || 0)])
  );
};

const deleteOperationalRows = async (conn, { actor, cleanupId, fileStats }) => {
  const before = await snapshotCounts(conn);
  const [evidence] = await conn.execute("DELETE FROM evidence");
  const [plates] = await conn.execute("DELETE FROM plates");
  const [alerts] = await conn.execute("DELETE FROM alerts");
  const [events] = await conn.execute("DELETE FROM events");
  const after = await snapshotCounts(conn);

  const result = {
    cleanupId,
    eventsBefore: before.events,
    eventsAfter: after.events,
    alertsBefore: before.alerts,
    alertsAfter: after.alerts,
    evidenceRecordsBefore: before.evidence,
    evidenceRecordsAfter: after.evidence,
    evidenceBytesBefore: before.evidence_bytes,
    evidenceBytesAfter: after.evidence_bytes,
    platesBefore: before.plates,
    platesAfter: after.plates,
    deletedRows: {
      events: Number(events.affectedRows || 0),
      alerts: Number(alerts.affectedRows || 0),
      evidence: Number(evidence.affectedRows || 0),
      plates: Number(plates.affectedRows || 0),
    },
    files: { ...fileStats },
    preserved: {
      users: before.users === after.users,
      cameras: before.cameras === after.cameras,
      zones: before.zones === after.zones,
      riskRules: before.risk_rules === after.risk_rules,
      retentionSettings: before.retention_settings === after.retention_settings,
      cameraAssignments: before.camera_assignments === after.camera_assignments,
      systemHealth: before.system_health === after.system_health,
      auditLogsBefore: before.audit_logs,
    },
  };

  await auditService.recordAudit(
    {
      userId: actor.userId,
      action: "ALL_OPERATIONAL_DATA_CLEANED",
      entityType: "operational_data",
      entityId: cleanupId,
      details: {
        cleanupId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        timestamp: new Date().toISOString(),
        rowsBefore: {
          events: before.events,
          alerts: before.alerts,
          evidence: before.evidence,
          plates: before.plates,
        },
        rowsDeleted: result.deletedRows,
        evidenceBytesBefore: before.evidence_bytes,
        filesStaged: fileStats,
        configurationPreserved: result.preserved,
      },
      ipAddress: actor.ipAddress,
    },
    conn,
    { enforceCap: false }
  );
  result.preserved.auditLogsAfter = (await snapshotCounts(conn)).audit_logs;
  result.preserved.auditLogs = result.preserved.auditLogsAfter === before.audit_logs + 1;
  return result;
};

const cleanAllOperationalData = async ({
  actor,
  confirmationPhrase,
  storageRoot = DEFAULT_STORAGE_ROOT,
} = {}) => {
  if (!actor || actor.role !== "ADMINISTRATOR") {
    throw new ApiError(403, "Administrator access required");
  }
  if (confirmationPhrase !== "DELETE ALL DATA") {
    throw new ApiError(400, "confirmationPhrase must exactly equal DELETE ALL DATA");
  }
  if (!retentionService.acquireCleanupLock()) {
    throw new ApiError(409, "Another cleanup is already running");
  }

  const cleanupId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = null;
  let conn = null;
  let committed = false;
  try {
    stage = stageEvidenceFiles({ storageRoot, cleanupId });
    conn = await getPool().getConnection();
    await conn.beginTransaction();
    let result;
    try {
      result = await deleteOperationalRows(conn, {
        actor,
        cleanupId,
        fileStats: stage.stats,
      });
      await conn.commit();
      committed = true;
    } catch (err) {
      await conn.rollback();
      restoreStagedFiles(stage);
      stage = null;
      throw err;
    }

    let quarantineCleanupPending = false;
    try {
      finalizeStagedFiles(stage);
    } catch (err) {
      quarantineCleanupPending = true;
      logger.error(`Operational cleanup ${cleanupId} committed but quarantine removal failed: ${err.message}`);
    }
    result.snapshotFilesRemoved = quarantineCleanupPending ? 0 : stage.stats.snapshotFiles;
    result.clipFilesRemoved = quarantineCleanupPending ? 0 : stage.stats.clipFiles;
    result.faceFilesRemoved = quarantineCleanupPending ? 0 : stage.stats.faceFiles;
    result.evidenceFilesRemoved = quarantineCleanupPending ? 0 : stage.stats.totalFiles;
    result.evidenceFileBytesRemoved = quarantineCleanupPending ? 0 : stage.stats.totalBytes;
    result.quarantineCleanupPending = quarantineCleanupPending;
    result.durationMs = Date.now() - startedAt;

    realtimeService.emitOperationalDataCleaned({
      cleanupId,
      eventsAfter: result.eventsAfter,
      alertsAfter: result.alertsAfter,
      evidenceRecordsAfter: result.evidenceRecordsAfter,
    });
    logger.info(
      `All operational data cleaned by user=${actor.userId} cleanupId=${cleanupId} ` +
      `events=${result.deletedRows.events} alerts=${result.deletedRows.alerts} ` +
      `evidence=${result.deletedRows.evidence} plates=${result.deletedRows.plates}`
    );
    return result;
  } catch (err) {
    if (stage && !committed) restoreStagedFiles(stage);
    throw err;
  } finally {
    if (conn) conn.release();
    retentionService.releaseCleanupLock();
  }
};

module.exports = {
  cleanAllOperationalData,
  deleteOperationalRows,
  snapshotCounts,
  stageEvidenceFiles,
  restoreStagedFiles,
  finalizeStagedFiles,
  DEFAULT_STORAGE_ROOT,
};
