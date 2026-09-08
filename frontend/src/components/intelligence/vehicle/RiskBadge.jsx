import React from "react";
import Badge from "../../common/Badge";

const toneMap = {
  normal: "info",
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "critical",
};

/**
 * Vehicle risk badge with an explicit label (never color-only).
 */
function RiskBadge({ risk }) {
  const key = String(risk || "NORMAL").toLowerCase();
  const tone = toneMap[key] || "info";
  return <Badge tone={tone}>{risk || "NORMAL"}</Badge>;
}

export default RiskBadge;
