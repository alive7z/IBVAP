const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const alertService = require("../services/alert.service");

const list = async (req, res) => {
  const data = await alertService.listAlerts(req.query);
  return sendSuccess(res, 200, "Alerts retrieved", data);
};

const summary = async (req, res) => {
  const data = await alertService.getAlertSummary();
  return sendSuccess(res, 200, "Alert summary retrieved", data);
};

const detail = async (req, res) => {
  const alert = await alertService.getAlert(req.params.alertId);
  return sendSuccess(res, 200, "Alert retrieved", { alert });
};

const acknowledge = async (req, res) => {
  const alert = await alertService.acknowledgeAlert(req.params.alertId, getActor(req));
  return sendSuccess(res, 200, "Alert acknowledged", { alert });
};

const investigate = async (req, res) => {
  const alert = await alertService.investigateAlert(req.params.alertId, getActor(req));
  return sendSuccess(res, 200, "Alert under investigation", { alert });
};

const falsePositive = async (req, res) => {
  const alert = await alertService.falsePositiveAlert(req.params.alertId, req.body || {}, getActor(req));
  return sendSuccess(res, 200, "Alert marked false positive", { alert });
};

const escalate = async (req, res) => {
  const alert = await alertService.escalateAlert(req.params.alertId, req.body || {}, getActor(req));
  return sendSuccess(res, 200, "Alert escalated to administrator", { alert });
};

const resolve = async (req, res) => {
  const alert = await alertService.resolveAlert(req.params.alertId, req.body || {}, getActor(req));
  return sendSuccess(res, 200, "Alert resolved", { alert });
};

const protect = async (req, res) => {
  const alert = await alertService.protectAlert(req.params.alertId, getActor(req));
  return sendSuccess(res, 200, "Alert protected from retention cleanup", { alert });
};

const unprotect = async (req, res) => {
  const alert = await alertService.unprotectAlert(req.params.alertId, getActor(req));
  return sendSuccess(res, 200, "Alert protection removed", { alert });
};

const remove = async (req, res) => {
  const alert = await alertService.deleteAlert(req.params.alertId, req.body || {}, getActor(req));
  return sendSuccess(res, 200, "Alert deleted", { alert });
};

module.exports = {
  list,
  summary,
  detail,
  acknowledge,
  investigate,
  falsePositive,
  escalate,
  resolve,
  protect,
  unprotect,
  remove,
};