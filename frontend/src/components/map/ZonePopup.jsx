import React from "react";
import Badge from "../common/Badge";
import { ShieldIcon } from "../common/Icons";

const riskTone = (level) => {
  const l = String(level || "").toLowerCase();
  if (l === "high") return "high";
  if (l === "medium") return "medium";
  if (l === "low") return "low";
  return "info";
};

/**
 * Restricted zone popup.
 */
function ZonePopup({ zone }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <ShieldIcon size={15} className="text-blue-700" />
        <p className="text-sm font-bold text-slate-900">{zone.name}</p>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Type:</span>
          <Badge tone="new">{zone.type}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Associated Camera:</span>
          <span className="font-medium text-slate-700">{zone.cameraId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Risk Level:</span>
          <Badge tone={riskTone(zone.riskLevel)}>{(zone.riskLevel || "").toUpperCase()}</Badge>
        </div>
      </div>
    </div>
  );
}

export default ZonePopup;
