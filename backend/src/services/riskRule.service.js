const riskRuleRepository = require("../repositories/riskRule.repository");
const { isRuntimeSupported } = require("../config/runtimeSupport");
const auditService = require("./audit.service");
const realtimeService = require("../realtime/realtime.service");
const { handleDuplicate } = require("../utils/dbErrors");
const ApiError = require("../utils/ApiError");
const {
  assertRequired,
  parseBoolean,
  parseNumber,
} = require("../utils/validation");

const toSafeRule = (rule) => {
  if (!rule) return null;
  const { id: _id, ...safe } = rule;
  return { ...safe, runtimeSupported: isRuntimeSupported(rule.rule_code) };
};

const listRules = async (filters) => {
  const result = await riskRuleRepository.findMany(filters);
  return {
    items: result.items.map(toSafeRule),
    pagination: result.pagination,
  };
};

const getRule = async (ruleId) => {
  const rule = await riskRuleRepository.findByCode(ruleId);
  if (!rule) {
    throw new ApiError(404, "Risk rule not found");
  }
  return toSafeRule(rule);
};

const validateAndNormalize = (data) => {
  const normalized = { ...data };
  if (data.weight !== undefined && data.weight !== null && data.weight !== "") {
    normalized.weight = parseNumber(data.weight, "weight", { min: 0, max: 999.99 });
  }
  if (
    data.confidenceThreshold !== undefined &&
    data.confidenceThreshold !== null &&
    data.confidenceThreshold !== ""
  ) {
    normalized.confidenceThreshold = parseNumber(
      data.confidenceThreshold,
      "confidenceThreshold",
      { min: 0, max: 1 }
    );
  }
  if (data.minimumDurationMs !== undefined && data.minimumDurationMs !== null) {
    normalized.minimumDurationMs = parseNumber(data.minimumDurationMs, "minimumDurationMs", {
      min: 0,
    });
  }
  if (data.cooldownSeconds !== undefined && data.cooldownSeconds !== null) {
    normalized.cooldownSeconds = parseNumber(data.cooldownSeconds, "cooldownSeconds", { min: 0 });
  }
  if (data.enabled !== undefined) {
    normalized.enabled = parseBoolean(data.enabled, "enabled");
  }
  return normalized;
};

const createRule = async (data, actor) => {
  assertRequired(data.ruleCode, "ruleCode is required");
  assertRequired(data.name, "name is required");

  const normalized = validateAndNormalize(data);

  const conn = await riskRuleRepository.beginTransaction();
  try {
    const rule = await riskRuleRepository.create(normalized, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "RISK_RULE_CREATED",
      entityType: "risk_rule",
      entityId: rule.rule_code,
      details: { ruleCode: rule.rule_code, name: rule.name },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
    return toSafeRule(rule);
  } catch (err) {
    await conn.rollback();
    return handleDuplicate(err, `Risk rule code ${data.ruleCode} already exists`);
  } finally {
    conn.release();
  }
};

const updateRule = async (ruleId, data, actor) => {
  const existing = await riskRuleRepository.findByCode(ruleId);
  if (!existing) {
    throw new ApiError(404, "Risk rule not found");
  }

  const normalized = validateAndNormalize(data);
  if (
    normalized.enabled === true &&
    isRuntimeSupported(existing.rule_code) === false
  ) {
    throw new ApiError(
      400,
      "Risk rule has no runtime producer in the AI engine and cannot be enabled"
    );
  }
  const conn = await riskRuleRepository.beginTransaction();
  let rule;
  try {
    rule = await riskRuleRepository.update(existing.id, normalized, conn);
    await auditService.recordAudit({
      userId: actor.userId,
      action: "RISK_RULE_UPDATED",
      entityType: "risk_rule",
      entityId: rule.rule_code,
      details: { ruleCode: rule.rule_code },
      ipAddress: actor.ipAddress,
    }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  realtimeService.emitRiskRuleUpdated(rule);
  return toSafeRule(rule);
};

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  toSafeRule,
};
