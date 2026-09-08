import React from "react";
import Badge from "../common/Badge";
import { severityTone } from "../../utils/severity";

/**
 * Severity / status badge for a camera. Always includes a text label
 * (severity is never conveyed by color alone).
 */
function CameraStatus({ severity, risk }) {
  // Offline takes precedence
  if (risk === "offline") {
    return <Badge tone="offline">Offline</Badge>;
  }
  // Fall back to the generic severity badge
  const tone = severityTone[severity] || "info";
  const label = (severity?.toUpperCase?.() || "INFO");
  return <Badge tone={tone} dot>{label}</Badge>;
}

export default CameraStatus;
