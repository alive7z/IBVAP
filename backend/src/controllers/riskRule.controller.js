const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const riskRuleService = require("../services/riskRule.service");

const list = async (req, res) => {
  const data = await riskRuleService.listRules(req.query);
  return sendSuccess(res, 200, "Risk rules retrieved", data);
};

const detail = async (req, res) => {
  const rule = await riskRuleService.getRule(req.params.ruleId);
  return sendSuccess(res, 200, "Risk rule retrieved", { rule });
};

const create = async (req, res) => {
  const rule = await riskRuleService.createRule(req.body, getActor(req));
  return sendSuccess(res, 201, "Risk rule created", { rule });
};

const update = async (req, res) => {
  const rule = await riskRuleService.updateRule(req.params.ruleId, req.body, getActor(req));
  return sendSuccess(res, 200, "Risk rule updated", { rule });
};

module.exports = { list, detail, create, update };
