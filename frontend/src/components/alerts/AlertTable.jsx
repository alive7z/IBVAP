import React from "react";
import { Link } from "react-router-dom";
import AlertRow from "./AlertRow";
import AlertSeverityBadge from "./AlertSeverityBadge";
import AlertStatusBadge from "./AlertStatusBadge";
import RiskScoreBar from "./RiskScoreBar";
import Button from "../common/Button";
import AcknowledgeAlertButton from "./AcknowledgeAlertButton";
import { TrashIcon } from "../common/Icons";
import { formatDateTime, formatTime } from "../../utils/date";

/**
 * Alerts table for desktop/tablet plus compact cards for mobile.
 * Handles loading / empty / error states via the grid wrapper.
 */
function AlertTable({ alerts, canDelete = false, onDelete, onAlertAcknowledged }) {
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Alert ID</th>
                <th className="px-5 py-3">Event Type</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Risk Score</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  canDelete={canDelete}
                  onDelete={onDelete}
                  onAlertAcknowledged={onAlertAcknowledged}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile compact cards */}
      <div className="space-y-3 md:hidden">
        {alerts.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-blue-700">{a.id}</p>
                <p className="text-sm text-slate-700">{a.eventType}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {a.camera} · {a.cameraName} · {formatTime(a.timestamp)}
                </p>
              </div>
              <AlertSeverityBadge severity={a.severity} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <RiskScoreBar score={a.riskScore} />
              <div className="text-right">
                <AlertStatusBadge status={a.status} />
                {a.acknowledgedBy && (
                  <p className="mt-1 text-xs text-slate-500">
                    {a.acknowledgedBy} · {formatDateTime(a.acknowledgedAt)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <AcknowledgeAlertButton
                alert={a}
                onAcknowledged={onAlertAcknowledged}
              />
              <Link
                to={`/alerts/${a.id}`}
                className="btn-focus inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View
              </Link>
              {canDelete && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(a)}
                  aria-label={`Delete alert ${a.id}`}
                >
                  <TrashIcon size={14} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default AlertTable;
