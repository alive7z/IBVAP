import React from "react";
import { Link } from "react-router-dom";
import Badge from "../common/Badge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import Button from "../common/Button";
import { BellIcon } from "../common/Icons";
import { formatTime } from "../../utils/date";

/**
 * Compact side panel listing active alerts. Clicking an alert centres the
 * map on it and opens its popup.
 */
function ActiveAlertsPanel({ alerts, selectedId, onSelect, className = "" }) {
  return (
    <div className={`card flex min-w-0 flex-col ${className}`}>
      <div className="mb-2 flex shrink-0 items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <BellIcon size={16} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">Active Alerts</h3>
        </div>
        <Badge tone="high">{alerts.length}</Badge>
      </div>

      <ul className="min-w-0 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {alerts.map((a) => {
          const active = a.id === selectedId;
          return (
            <li key={a.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(a)}
                className={`btn-focus flex w-full min-w-0 items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                  active ? "rounded-lg bg-blue-50/70" : "hover:bg-slate-50"
                }`}
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor(a.severity) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 text-xs font-bold text-slate-800">{a.id}</span>
                    <AlertSeverityBadge severity={a.severity} className="min-w-0" />
                  </span>
                  <span className="block truncate text-xs text-slate-700">{a.type}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {a.cameraId} · {a.sector} · {formatTime(a.timestamp)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button as={Link} to="/alerts" variant="secondary" size="sm" className="mt-3 shrink-0">
        View All Alerts
      </Button>
    </div>
  );
}

function dotColor(severity) {
  const s = String(severity || "").toLowerCase();
  return s === "critical"
    ? "#7f1d1d"
    : s === "high"
    ? "#dc2626"
    : s === "medium"
    ? "#f97316"
    : s === "low"
    ? "#eab308"
    : "#94a3b8";
}

export default ActiveAlertsPanel;
