import React from "react";
import { Link } from "react-router-dom";
import EventRow from "./EventRow";
import EventTypeBadge from "./EventTypeBadge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import AlertStatusBadge from "../alerts/AlertStatusBadge";
import RiskScoreBar from "../alerts/RiskScoreBar";
import Button from "../common/Button";
import { TrashIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";

/**
 * Events table for desktop/tablet plus stacked cards for mobile.
 */
function EventTable({ events, canDelete = false, onDelete }) {
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Event ID</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">Object</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Risk Score</th>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  canDelete={canDelete}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile compact cards */}
      <div className="space-y-3 md:hidden">
        {events.map((e) => (
          <div key={e.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to={`/events/${e.id}`}
                  className="font-semibold text-blue-700 hover:underline"
                >
                  {e.id}
                </Link>
                <div className="mt-1">
                  <EventTypeBadge type={e.type} />
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {e.camera} · {e.objectType}
                  {e.trackId ? ` #${e.trackId.split("-").pop()}` : ""} · {formatDateTime(e.timestamp)}
                </p>
              </div>
              <AlertSeverityBadge severity={e.severity} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <RiskScoreBar score={e.riskScore} />
              <AlertStatusBadge status={e.status} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Link
                to={`/events/${e.id}`}
                className="btn-focus inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View
              </Link>
              {canDelete && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(e)}
                  aria-label={`Delete event ${e.id}`}
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

export default EventTable;
