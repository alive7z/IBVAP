const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const operatorService = require("../services/operator.service");

const list = async (req, res) => {
  const data = await operatorService.listOperators(req.query, getActor(req));
  return sendSuccess(res, 200, "Operators retrieved", data);
};

const create = async (req, res) => {
  const data = await operatorService.createOperator(req.body || {}, getActor(req));
  return sendSuccess(res, 201, "Operator created", { operator: data });
};

const detail = async (req, res) => {
  const data = await operatorService.getOperator(req.params.operatorId);
  return sendSuccess(res, 200, "Operator retrieved", { operator: data });
};

const selfAnalytics = async (req, res) => {
  const data = await operatorService.getSelfAnalytics(getActor(req));
  return sendSuccess(res, 200, "Operator analytics retrieved", { operator: data });
};

const analytics = async (req, res) => {
  const data = await operatorService.getOperatorsAnalytics(req.query);
  return sendSuccess(res, 200, "Operator analytics retrieved", data);
};

const setEnabled = async (req, res) => {
  const data = await operatorService.setOperatorEnabled(
    req.params.operatorId,
    req.body.enabled,
    getActor(req)
  );
  return sendSuccess(res, 200, "Operator state updated", { operator: data });
};

const assignCameras = async (req, res) => {
  const data = await operatorService.assignCameras(
    req.params.operatorId,
    req.body.cameraIds,
    getActor(req)
  );
  return sendSuccess(res, 200, "Camera assignment updated", { operator: data });
};

const unassignCameras = async (req, res) => {
  const data = await operatorService.unassignCameras(
    req.params.operatorId,
    req.body.cameraIds,
    getActor(req)
  );
  return sendSuccess(res, 200, "Camera assignment updated", { operator: data });
};

module.exports = { list, create, detail, selfAnalytics, analytics, setEnabled, assignCameras, unassignCameras };
