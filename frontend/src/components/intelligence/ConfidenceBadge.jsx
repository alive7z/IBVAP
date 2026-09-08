import React from "react";
import Badge from "../common/Badge";

export function ocrQuality(pct) {
  if (pct >= 90) return "high";
  if (pct >= 75) return "medium";
  return "low";
}

export function confidencePercent(value) {
  // Accepts either a 0..1 fraction or a 0..100 integer.
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.round(n > 1 ? n : n * 100);
}

const toneMap = { high: "success", medium: "warning", low: "info" };

/**
 * Confidence badge with an explicit text label (High / Medium / Low).
 */
function ConfidenceBadge({ value, lowLabel = "Low confidence" }) {
  if (value === null || value === undefined || value === "") {
    return <Badge tone="default">—</Badge>;
  }
  const pct = confidencePercent(value);
  const q = ocrQuality(pct);
  const label = q === "high" ? "High" : q === "medium" ? "Medium" : lowLabel;
  return (
    <Badge tone={toneMap[q]}>{`${pct}% · ${label}`}</Badge>
  );
}

export default ConfidenceBadge;
