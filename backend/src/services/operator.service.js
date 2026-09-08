const ApiError = require("../utils/ApiError");
const { parseDateRange } = require("../utils/datetime");
const operatorRepository = require("../repositories/operator.repository");
const auditService = require("./audit.service");
const cameraRepository = require("../repositories/camera.repository");
const { parseBoolean } = require("../utils/validation");
const { hashPassword } = require("../utils/password");
const userRepository = require("../repositories/user.repository");
const crypto = require("crypto");

const listOperators = async (filters) => {
  const result = await operatorRepository.findMany({ ...filters, role: "SECURITY_OPERATOR" });
  return {
    items: result.items,
    pagination: result.pagination,
  };
};

const createOperator = async (body, actor) => {
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!fullName || fullName.length > 120) throw new ApiError(400, "fullName must be between 1 and 120 characters");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) throw new ApiError(400, "A valid email is required");
  if (password.length < 12 || password.length > 128) throw new ApiError(400, "password must be between 12 and 128 characters");
  if (body.role && body.role !== "SECURITY_OPERATOR") throw new ApiError(400, "Only SECURITY_OPERATOR accounts can be created here");

  const conn = await operatorRepository.beginTransaction();
  try {
    const id = await userRepository.createUser({
      publicId: crypto.randomUUID(),
      fullName,
      email,
      passwordHash: await hashPassword(password),
      role: "SECURITY_OPERATOR",
      status: "ACTIVE",
    }, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "OPERATOR_CREATED",
      entityType: "operator",
      entityId: String(id),
      details: { fullName, email, role: "SECURITY_OPERATOR" },
      ipAddress: actor.ipAddress,
    }, conn);
    await operatorRepository.commit(conn);
    return getOperator(id);
  } catch (err) {
    await operatorRepository.rollback(conn);
    if (err && err.code === "ER_DUP_ENTRY") throw new ApiError(409, "An account with this email already exists");
    throw err;
  } finally {
    await operatorRepository.release(conn);
  }
};

const getOperator = async (operatorId) => {
  const id = Number(operatorId);
  if (!Number.isInteger(id)) {
    throw new ApiError(400, "Invalid operator id");
  }
  const op = await operatorRepository.findById(id);
  if (!op) {
    throw new ApiError(404, "Operator not found");
  }
  const [assigned, analytics] = await Promise.all([
    operatorRepository.listAssignedCameras(id),
    operatorRepository.analyticsAggregates({ operatorId: id }),
  ]);
  return {
    ...op,
    assignedCameras: assigned,
    analytics,
  };
};

// Operator self-analytics: same shape as admin viewing one operator.
const getSelfAnalytics = async (actor) => {
  const op = await operatorRepository.findById(actor.userId);
  if (!op) {
    throw new ApiError(404, "Operator not found");
  }
  const [assigned, analytics] = await Promise.all([
    operatorRepository.listAssignedCameras(actor.userId),
    operatorRepository.analyticsAggregates({ operatorId: actor.userId }),
  ]);
  return {
    ...op,
    assignedCameras: assigned,
    analytics,
  };
};

// All-operator aggregate analytics (admin).
const getOperatorsAnalytics = async (filters = {}) => {
  let range = {};
  if (filters.startDate || filters.endDate) {
    try {
      range = parseDateRange(filters);
    } catch (err) {
      if (err.isRangeError) throw new ApiError(400, err.message);
      throw err;
    }
  }
  const [items, aggregates] = await Promise.all([
    operatorRepository.findMany({ role: "SECURITY_OPERATOR" }),
    operatorRepository.analyticsAggregates(range),
  ]);
  return {
    operators: items.items,
    aggregates,
  };
};

const setOperatorEnabled = async (operatorId, enabled, actor) => {
  const id = Number(operatorId);
  if (!Number.isInteger(id)) {
    throw new ApiError(400, "Invalid operator id");
  }
  const op = await operatorRepository.findById(id);
  if (!op || op.role !== "SECURITY_OPERATOR") {
    throw new ApiError(404, "Operator not found");
  }
  if (op.id === actor.userId) {
    throw new ApiError(400, "You cannot disable your own account");
  }
  const normalizedEnabled = parseBoolean(enabled, "enabled");
  const conn = await operatorRepository.beginTransaction();
  try {
    await operatorRepository.updateOperatorStatus(id, normalizedEnabled ? "ACTIVE" : "INACTIVE", conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: normalizedEnabled ? "OPERATOR_ENABLED" : "OPERATOR_DISABLED",
      entityType: "operator",
      entityId: op.publicId,
      details: { operatorId: op.id, fullName: op.fullName },
      ipAddress: actor.ipAddress,
    }, conn);
    await operatorRepository.commit(conn);
  } catch (err) {
    await operatorRepository.rollback(conn);
    throw err;
  } finally {
    await operatorRepository.release(conn);
  }
  return getOperator(id);
};

const assignCameras = async (operatorId, cameraIds, actor) => {
  const id = Number(operatorId);
  if (!Number.isInteger(id)) {
    throw new ApiError(400, "Invalid operator id");
  }
  const op = await operatorRepository.findById(id);
  if (!op || op.role !== "SECURITY_OPERATOR") {
    throw new ApiError(404, "Operator not found");
  }
  if (!Array.isArray(cameraIds)) {
    throw new ApiError(400, "cameraIds must be an array");
  }
  const unique = [...new Set(cameraIds)].map(Number);
  if (unique.some((c) => !Number.isInteger(c))) {
    throw new ApiError(400, "cameraIds must be integers");
  }

  const conn = await operatorRepository.beginTransaction();
  try {
    for (const cameraId of unique) {
      const camera = await cameraRepository.findById(cameraId);
      if (!camera || camera.deleted_at) {
        throw new ApiError(400, `Camera ${cameraId} does not exist or is deleted`);
      }
      const existing = await operatorRepository.findAssignment({ operatorId: id, cameraId }, conn);
      if (!existing) {
        await operatorRepository.assignCamera({ operatorId: id, cameraId, assignedBy: actor.userId }, conn);
      }
    }
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "CAMERA_ASSIGNED",
        entityType: "operator",
        entityId: op.publicId,
        details: { operatorId: id, cameraIds: unique },
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await operatorRepository.commit(conn);
  } catch (err) {
    await operatorRepository.rollback(conn);
    throw err;
  } finally {
    await operatorRepository.release(conn);
  }

  return getOperator(id);
};

const unassignCameras = async (operatorId, cameraIds, actor) => {
  const id = Number(operatorId);
  if (!Number.isInteger(id)) {
    throw new ApiError(400, "Invalid operator id");
  }
  const op = await operatorRepository.findById(id);
  if (!op || op.role !== "SECURITY_OPERATOR") {
    throw new ApiError(404, "Operator not found");
  }
  if (!Array.isArray(cameraIds)) {
    throw new ApiError(400, "cameraIds must be an array");
  }
  const unique = [...new Set(cameraIds)].map(Number);
  if (unique.some((c) => !Number.isInteger(c))) {
    throw new ApiError(400, "cameraIds must be integers");
  }

  const conn = await operatorRepository.beginTransaction();
  try {
    for (const cameraId of unique) {
      await operatorRepository.unassignCamera({ operatorId: id, cameraId }, conn);
    }
    await auditService.recordAudit(
      {
        userId: actor.userId,
        action: "CAMERA_UNASSIGNED",
        entityType: "operator",
        entityId: op.publicId,
        details: { operatorId: id, cameraIds: unique },
        ipAddress: actor.ipAddress,
      },
      conn
    );
    await operatorRepository.commit(conn);
  } catch (err) {
    await operatorRepository.rollback(conn);
    throw err;
  } finally {
    await operatorRepository.release(conn);
  }

  return getOperator(id);
};

module.exports = {
  listOperators,
  createOperator,
  getOperator,
  getSelfAnalytics,
  getOperatorsAnalytics,
  setOperatorEnabled,
  assignCameras,
  unassignCameras,
};
