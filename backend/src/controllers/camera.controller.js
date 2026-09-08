const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const ApiError = require("../utils/ApiError");
const cameraService = require("../services/camera.service");
const cameraRuntimeService = require("../services/cameraRuntime.service");
const previewService = require("../services/preview.service");

const list = async (req, res) => {
  const data = await cameraService.listCameras(req.query, getActor(req));
  return sendSuccess(res, 200, "Cameras retrieved", data);
};

const detail = async (req, res) => {
  const camera = await cameraService.getCamera(req.params.cameraId, getActor(req));
  return sendSuccess(res, 200, "Camera retrieved", { camera });
};

// Phase 13 — live/redis runtime status for a camera. Never exposes stream_url.
const runtimeStatus = async (req, res) => {
  res.set("Cache-Control", "no-store");
  await cameraService.getCamera(req.params.cameraId, getActor(req));
  const status = await cameraRuntimeService.runtimeStatusForCamera(req.params.cameraId);
  if (!status) {
    throw new ApiError(404, "Camera not found");
  }
  return sendSuccess(res, 200, "Camera runtime status retrieved", { camera: status });
};

// Phase 13 — short-lived preview URL (browser <img> cannot send auth headers).
const previewToken = async (req, res) => {
  res.set("Cache-Control", "no-store");
  await cameraService.getCamera(req.params.cameraId, getActor(req));
  const status = await cameraRuntimeService.runtimeStatusForCamera(req.params.cameraId);
  if (!status) {
    throw new ApiError(404, "Camera not found");
  }
  if (!status.enabled) {
    throw new ApiError(400, "Camera preview is disabled");
  }
  const cameraCode = status.cameraCode;
  if (!cameraCode || typeof cameraCode !== "string" || cameraCode.trim() === "") {
    throw new ApiError(500, "Preview token generation failed: missing camera identifier");
  }
  const previewUrl = previewService.issuePreviewUrl(cameraCode);
  return sendSuccess(res, 200, "Preview URL issued", { previewUrl });
};

const create = async (req, res) => {
  const camera = await cameraService.createCamera(req.body, getActor(req));
  return sendSuccess(res, 201, "Camera created", { camera });
};

const update = async (req, res) => {
  const camera = await cameraService.updateCamera(req.params.cameraId, req.body, getActor(req));
  return sendSuccess(res, 200, "Camera updated", { camera });
};

const remove = async (req, res) => {
  const camera = await cameraService.deleteCamera(req.params.cameraId, getActor(req));
  return sendSuccess(res, 200, "Camera deleted", { camera });
};

module.exports = { list, detail, create, update, remove, runtimeStatus, previewToken };
