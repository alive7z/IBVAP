const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const ApiError = require("../utils/ApiError");
const retentionSettingsService = require("../services/retentionSettings.service");

const get = async (req, res) => {
  const [settings, stats] = await Promise.all([
    retentionSettingsService.getSettings(),
    retentionSettingsService.getRunStats(),
  ]);
  return sendSuccess(res, 200, "Retention settings retrieved", { settings, stats });
};

const update = async (req, res) => {
  const data = await retentionSettingsService.updateSettings(req.body || {}, getActor(req));
  return sendSuccess(res, 200, "Retention settings updated", { settings: data });
};

const run = async (req, res) => {
  const result = await retentionSettingsService.triggerCleanup(getActor(req));
  return sendSuccess(res, 200, "Retention cleanup completed", { result });
};

const cleanAll = async (req, res) => {
  if ((req.body || {}).confirmationPhrase !== "DELETE ALL DATA") {
    throw new ApiError(400, "confirmationPhrase must exactly equal DELETE ALL DATA");
  }
  const result = await retentionSettingsService.cleanAllOperationalData(
    getActor(req),
    req.body.confirmationPhrase
  );
  return sendSuccess(res, 200, "All operational data cleaned", { result });
};

module.exports = { get, update, run, cleanAll };
