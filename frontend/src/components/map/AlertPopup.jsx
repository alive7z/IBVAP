import React from "react";
import Badge from "../common/Badge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import { AlertTriangleIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";

/**
 * Compact active-alert popup rendered inside a Leaflet popup.
 */
function AlertPopup({ alert, onViewAlert }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <AlertTriangleIcon size={15} className="text-red-600" />
        <p className="text-sm font-bold text-slate-900">{alert.id}</p>
      </div>
      <p className="text-sm text-slate-600">{alert.type}</p>

      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Severity:</span>
          <AlertSeverityBadge severity={alert.severity} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Camera:</span>
          <span className="font-medium text-slate-700">{alert.cameraId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Risk Score:</span>
          <span className="font-medium text-slate-700">{alert.riskScore ?? "—"} / 100</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Time:</span>
          <span className="text-slate-700">{formatDateTime(alert.timestamp)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onViewAlert}
        className="btn-focus mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        View Alert
      </button>
    </div>
  );
}

export default AlertPopup;
