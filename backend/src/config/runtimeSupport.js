// Rule codes that have an actual runtime producer in the Python Context/Risk
// engines. Rules outside this set are config-only: no evidence can ever be
// produced for them, so the AI engine excludes them from the risk score
// denominator and the Admin UI must mark them as unavailable.
const RUNTIME_SUPPORTED_RULES = new Set([
  "RESTRICTED_ZONE_ENTRY",
  "VIRTUAL_FENCE_CROSSING",
  "FENCE_PROXIMITY",
  "NIGHT_MOVEMENT",
  "LOITERING",
]);

const isRuntimeSupported = (ruleCode) => RUNTIME_SUPPORTED_RULES.has(String(ruleCode));

module.exports = { RUNTIME_SUPPORTED_RULES, isRuntimeSupported };
