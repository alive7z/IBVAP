const { sendSuccess } = require("../utils/ApiResponse");
const intelligenceService = require("../services/intelligence.service");

const listPlates = async (req, res) => {
  const data = await intelligenceService.listPlates(req.query);
  return sendSuccess(res, 200, "Plate records retrieved", data);
};

const plateDetail = async (req, res) => {
  const plate = await intelligenceService.getPlate(req.params.plateEventId);
  return sendSuccess(res, 200, "Plate record retrieved", { plate });
};

const summary = async (_req, res) => {
  const data = await intelligenceService.getSummary();
  return sendSuccess(res, 200, "Intelligence summary retrieved", data);
};

const listFaces = async (req, res) => {
  const data = await intelligenceService.listFaces(req.query);
  return sendSuccess(res, 200, "Face detections retrieved", data);
};

const listVehicles = async (req, res) => {
  const data = await intelligenceService.listVehicles(req.query);
  return sendSuccess(res, 200, "Vehicle detections retrieved", data);
};

module.exports = { summary, listPlates, plateDetail, listFaces, listVehicles };
