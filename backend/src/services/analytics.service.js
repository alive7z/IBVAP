const analyticsRepository = require("../repositories/analytics.repository");
const ApiError = require("../utils/ApiError");
const { parseDateRange } = require("../utils/datetime");
const { parseNumber } = require("../utils/validation");

const resolveDates = (filters = {}) => {
  try {
    return parseDateRange(filters);
  } catch (err) {
    if (err.isRangeError) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }
};

const overview = async () => analyticsRepository.overview();

const eventsAnalytics = async (filters = {}) => {
  const range = resolveDates(filters);

  const [bySeverity, byType, overTime, byCamera, byHour] = await Promise.all([
    analyticsRepository.eventsBySeverity(),
    analyticsRepository.eventsByType(),
    analyticsRepository.eventsOverTime(range),
    analyticsRepository.eventsByCamera(parseNumber(filters.topN ?? 10, "topN", { min: 1, max: 100 })),
    analyticsRepository.eventsByHour(),
  ]);

  return {
    bySeverity,
    byType,
    overTime,
    byCamera,
    byHour,
  };
};

const alertsAnalytics = async (filters = {}) => {
  const range = resolveDates(filters);

  const [bySeverity, byStatus, overTime, average] = await Promise.all([
    analyticsRepository.alertsBySeverity(),
    analyticsRepository.alertsByStatus(),
    analyticsRepository.alertsOverTime(range),
    analyticsRepository.averageRiskScore(range),
  ]);

  return {
    bySeverity,
    byStatus,
    overTime,
    average: average,
  };
};

const camerasAnalytics = async () => {
  const [byStatus, bySector, alertCounts] = await Promise.all([
    analyticsRepository.camerasByStatus(),
    analyticsRepository.camerasBySector(),
    analyticsRepository.alertCountPerCamera(10),
  ]);

  return {
    byStatus,
    bySector,
    alertsPerCamera: alertCounts,
  };
};

const operatorsAnalytics = async () => {
  const [responseTime, workload] = await Promise.all([
    analyticsRepository.responseTimeAnalytics(),
    analyticsRepository.operatorWorkload(10),
  ]);
  return { responseTime, workload };
};

module.exports = {
  overview,
  eventsAnalytics,
  alertsAnalytics,
  camerasAnalytics,
  operatorsAnalytics,
};
