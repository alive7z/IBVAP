const ApiError = require("../utils/ApiError");
const cameraRepository = require("../repositories/camera.repository");
const riskRuleRepository = require("../repositories/riskRule.repository");
const { isRuntimeSupported } = require("../config/runtimeSupport");

// Severity classification thresholds (score ranges → severity). These are the
// authoritative values returned to the AI Risk Engine. Dev defaults mirror
// the Phase 10 spec; operators can override per-band via env vars.
//   INFO 0–19, LOW 20–39, MEDIUM 40–59, HIGH 60–79, CRITICAL 80–100.
const severityThresholds = () => ({
  info: 0,
  low: Number(process.env.RISK_SEVERITY_LOW || 20),
  medium: Number(process.env.RISK_SEVERITY_MEDIUM || 40),
  high: Number(process.env.RISK_SEVERITY_HIGH || 60),
  critical: Number(process.env.RISK_SEVERITY_CRITICAL || 80),
});

// Duration-tier policy is delivered through the existing risk-config channel.
// Override with RISK_LOITERING_DURATION_TIERS as a JSON array using the same
// shape. The final tier is exclusive so exactly 120 seconds remains score 65.
const DEFAULT_LOITERING_DURATION_TIERS = Object.freeze([
  { minimumDurationSeconds: 10, score: 15 },
  { minimumDurationSeconds: 20, score: 25 },
  { minimumDurationSeconds: 30, score: 40 },
  { minimumDurationSeconds: 45, score: 50 },
  { minimumDurationSeconds: 60, score: 65 },
  { minimumDurationSeconds: 120, score: 80, exclusive: true },
]);

const validDurationTiers = (tiers) => {
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  let previous = -1;
  return tiers.every((tier) => {
    const duration = Number(tier && tier.minimumDurationSeconds);
    const score = Number(tier && tier.score);
    const valid =
      Number.isFinite(duration) && duration >= 0 && duration >= previous &&
      Number.isFinite(score) && score >= 0 && score <= 100;
    previous = duration;
    return valid;
  });
};

const loiteringDurationTiers = () => {
  const configured = process.env.RISK_LOITERING_DURATION_TIERS;
  if (!configured) return DEFAULT_LOITERING_DURATION_TIERS.map((tier) => ({ ...tier }));
  try {
    const parsed = JSON.parse(configured);
    if (validDurationTiers(parsed)) {
      return parsed.map((tier) => ({
        minimumDurationSeconds: Number(tier.minimumDurationSeconds),
        score: Number(tier.score),
        ...(tier.exclusive ? { exclusive: true } : {}),
      }));
    }
  } catch {
    // Fall through to safe defaults; malformed env must not disable scoring.
  }
  return DEFAULT_LOITERING_DURATION_TIERS.map((tier) => ({ ...tier }));
};

// Build the risk configuration consumed by the AI Risk Engine (Phase 10).
// Python NEVER queries MySQL directly — it fetches this payload over the
// internal service endpoint and caches it. Returns enabled risk rules plus
// the severity classification thresholds.
const getCameraRiskConfig = async (cameraCode) => {
  if (!cameraCode) {
    throw new ApiError(400, "cameraCode is required");
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }

  const { items } = await riskRuleRepository.findMany({ enabled: true });

  const rules = items.map((r) => {
    const runtimeSupported = isRuntimeSupported(r.rule_code);
    const rule = {
      ruleCode: r.rule_code,
      name: r.name,
      category: r.category || "",
      weight: r.weight,
      minimumDurationMs: r.minimum_duration_ms,
      confidenceThreshold: r.confidence_threshold,
      cooldownSeconds: r.cooldown_seconds,
      // Never activate a config row that has no defensible runtime producer.
      // REPEATED_ENTRY is intentionally unsupported without persistent ReID;
      // an enabled legacy DB row therefore cannot reach live scoring.
      enabled: Boolean(r.enabled && runtimeSupported),
      runtimeSupported,
    };
    if (r.rule_code === "LOITERING") {
      rule.durationTiers = loiteringDurationTiers();
    }
    return rule;
  });

  return {
    cameraCode,
    rules,
    severityThresholds: severityThresholds(),
    maxPossibleWeight: rules.reduce(
      (sum, r) => sum + (r.enabled ? Number(r.weight || 0) : 0),
      0
    ),
  };
};

module.exports = {
  getCameraRiskConfig,
  severityThresholds,
  loiteringDurationTiers,
  DEFAULT_LOITERING_DURATION_TIERS,
};
