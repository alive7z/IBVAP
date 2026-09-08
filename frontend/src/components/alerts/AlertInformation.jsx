import React from "react";
import Card from "../common/Card";
import AlertSeverityBadge from "./AlertSeverityBadge";
import AlertStatusBadge from "./AlertStatusBadge";
import { InfoIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";

function Row({ label, value, children }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      {children ? <span className="text-sm font-medium text-slate-800">{children}</span> : (
        <span className="text-sm font-medium text-slate-800">{value || "—"}</span>
      )}
    </div>
  );
}

/**
 * Alert metadata panel.
 */
function AlertInformation({ alert }) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <InfoIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">
          Alert Information
        </h3>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        <Row label="Alert ID" value={alert.id} />
        <Row label="Event ID" value={alert.eventId} />
        <Row label="Event Type" value={alert.eventType} />
        <Row label="Camera" value={`${alert.camera} · ${alert.cameraName}`} />
        <Row label="Location" value={alert.location} />
        <Row label="Object Type" value={alert.objectType} />
        <Row label="Track ID" value={alert.trackId} />
        <Row label="Risk Score" value={`${alert.riskScore ?? "—"} / 100`} />
        <Row label="Severity">
          <AlertSeverityBadge severity={alert.severity} />
        </Row>
        <Row label="Status">
          <AlertStatusBadge status={alert.status} />
        </Row>
        <Row label="Acknowledged By" value={alert.acknowledgedBy} />
        <Row
          label="Acknowledged At"
          value={alert.acknowledgedAt ? formatDateTime(alert.acknowledgedAt) : null}
        />
        <Row label="Timestamp" value={formatDateTime(alert.timestamp)} />
      </dl>
    </Card>
  );
}

export default AlertInformation;
