const { sendSuccess } = require("../utils/ApiResponse");
const analyticsService = require("../services/analytics.service");

const overview = async (req, res) => {
  const data = await analyticsService.overview();
  return sendSuccess(res, 200, "Analytics overview", { ...data });
};

const events = async (req, res) => {
  const data = await analyticsService.eventsAnalytics(req.query);
  return sendSuccess(res, 200, "Event analytics", { ...data });
};

const alerts = async (req, res) => {
  const data = await analyticsService.alertsAnalytics(req.query);
  return sendSuccess(res, 200, "Alert analytics", { ...data });
};

const cameras = async (req, res) => {
  const data = await analyticsService.camerasAnalytics();
  return sendSuccess(res, 200, "Camera analytics", { ...data });
};

const operators = async (req, res) => {
  const data = await analyticsService.operatorsAnalytics();
  return sendSuccess(res, 200, "Operator analytics", { ...data });
};

module.exports = { overview, events, alerts, cameras, operators };
