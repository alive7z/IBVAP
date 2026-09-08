const { sendSuccess } = require("../utils/ApiResponse");
const auditService = require("../services/audit.service");
const { getActor } = require("../utils/actor");
const env = require("../config/env");

const list = async (req, res) => {
  const data = await auditService.listAudits(req.query);
  return sendSuccess(res, 200, "Audit logs retrieved", data);
};

const detail = async (req, res) => {
  const audit = await auditService.getAudit(req.params.auditId);
  return sendSuccess(res, 200, "Audit log retrieved", { audit });
};

const stats = async (req, res) => {
  const total = await auditService.countAuditLogs();
  return sendSuccess(res, 200, "Audit log stats", {
    total,
    maxRows: env.AUDIT_LOG_MAX_ROWS,
  });
};

const cleanup = async (req, res) => {
  const result = await auditService.cleanupOldAuditLogs({
    keepCount: env.AUDIT_LOG_MAX_ROWS,
    actor: getActor(req),
  });
  return sendSuccess(res, 200, "Audit log cleanup completed", { result });
};

module.exports = { list, detail, stats, cleanup };
