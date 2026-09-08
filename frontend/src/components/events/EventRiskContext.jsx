import React from "react";
import Card from "../common/Card";
import Badge from "../common/Badge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import { ActivityIcon } from "../common/Icons";
import { riskCategory } from "../alerts/RiskScoreBar";

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">
        {value == null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

/**
 * Explainable risk context for security events. Informational events that
 * carry no elevated conditions show a placeholder message instead.
 */
function EventRiskContext({ event }) {
  const ctx = event.context || {};
  const isSecurity =
    event.severity && ["medium", "high", "critical"].includes(event.severity);
  const hasRisk =
    isSecurity || ctx.restrictedZone || ctx.nightMovement || ctx.fenceProximity;

  const cat = riskCategory(event.riskScore);

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <ActivityIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Risk Context</h3>
      </div>

      {hasRisk ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row
            label="Restricted Zone"
            value={<Badge tone={ctx.restrictedZone ? "high" : "info"}>{ctx.restrictedZone ? "Active" : "Clear"}</Badge>}
          />
          <Row
            label="Night Movement"
            value={<Badge tone={ctx.nightMovement ? "medium" : "info"}>{ctx.nightMovement ? "Active" : "Clear"}</Badge>}
          />
          <Row
            label="Fence Proximity"
            value={<Badge tone={ctx.fenceProximity ? "warning" : "info"}>{ctx.fenceProximity ? "Detected" : "Clear"}</Badge>}
          />
          <Row label="Direction" value={ctx.direction} />
          {ctx.duration != null && <Row label="Duration" value={`${ctx.duration} seconds`} />}
          <Row label="Risk Score" value={event.riskScore == null ? "—" : `${event.riskScore} / 100`} />
          <Row label="Severity" value={<AlertSeverityBadge severity={event.severity} />} />
        </dl>
      ) : (
        <p className="text-sm text-slate-500">
          No elevated risk conditions detected.
        </p>
      )}
    </Card>
  );
}

export default EventRiskContext;
