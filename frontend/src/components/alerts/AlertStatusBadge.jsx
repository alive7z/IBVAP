import React from "react";
import Badge from "../common/Badge";
import { statusTone } from "../../utils/severity";

/**
 * Status badge (New / Active / Acknowledged / Resolved).
 */
function AlertStatusBadge({ status, className = "" }) {
  const tone = statusTone[(status || "").toLowerCase()] || "default";
  return <Badge tone={tone} className={className}>{status}</Badge>;
}

export default AlertStatusBadge;
