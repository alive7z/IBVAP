import React from "react";
import Card from "../common/Card";
import StatusIndicator from "../common/StatusIndicator";
import { ActivityIcon } from "../common/Icons";

function lineTone(name, value) {
  if (value === "Clear" || value === "Inactive" || value === "Stationary") {
    return "success";
  }
  if (value === "Near" || value === "Approaching" || value === "Loitering" || value === "Crossing" || value === "Along Road" || value === "Inactive") {
    return "warning";
  }
  if (value === "Entered" || value === "Toward Boundary") {
    return "danger";
  }
  return "info";
}

/**
 * IBVAP Context Analysis / Risk Engine panel.
 */
function ContextStatus({ context }) {
  if (!context) return null;
  const rows = [
    { name: "Restricted Zone", value: context.restrictedZone },
    { name: "Virtual Fence", value: context.virtualFence },
    { name: "Night Mode", value: context.nightMode },
    { name: "Movement", value: context.movement },
    { name: "Duration", value: context.duration },
  ];
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <ActivityIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">
          Context / Security Status
        </h3>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{r.name}</span>
            <StatusIndicator status={lineTone(r.name, r.value)} label={r.value} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default ContextStatus;
