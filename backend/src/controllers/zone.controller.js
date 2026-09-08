const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const zoneService = require("../services/zone.service");

const list = async (req, res) => {
  const data = await zoneService.listZones(req.query);
  return sendSuccess(res, 200, "Zones retrieved", data);
};

const detail = async (req, res) => {
  const zone = await zoneService.getZone(req.params.zoneId);
  return sendSuccess(res, 200, "Zone retrieved", { zone });
};

const listByCamera = async (req, res) => {
  const zones = await zoneService.listZonesByCamera(req.params.cameraId);
  return sendSuccess(res, 200, "Camera zones retrieved", { zones });
};

const create = async (req, res) => {
  const zone = await zoneService.createZone(req.body, getActor(req));
  return sendSuccess(res, 201, "Zone created", { zone });
};

const update = async (req, res) => {
  const zone = await zoneService.updateZone(req.params.zoneId, req.body, getActor(req));
  return sendSuccess(res, 200, "Zone updated", { zone });
};

module.exports = { list, detail, listByCamera, create, update };
