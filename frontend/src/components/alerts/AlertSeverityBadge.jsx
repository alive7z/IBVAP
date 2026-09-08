import React from "react";
import Badge from "../common/Badge";
import { severityTone } from "../../utils/severity";

/**
 * Severity badge with an explicit text label (never color-only).
 * value is expected lowercase; it is uppercased for display.
 */
function AlertSeverityBadge({ severity, className = "" }) {
  const tone = severityTone[String(severity || "").toLowerCase()] || "info";
  return (
    <Badge tone={tone} dot className={className}>
      {(severity || "info").toUpperCase()}
    </Badge>
  );
}

export default AlertSeverityBadge;
