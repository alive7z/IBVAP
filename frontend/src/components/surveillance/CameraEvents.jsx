import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Badge from "../common/Badge";
import Button from "../common/Button";
import { FileTextIcon } from "../common/Icons";
import { severityTone, statusTone } from "../../utils/severity";

/**
 * Latest events for a specific camera with a "View All Events" action.
 */
function CameraEvents({ cameraId, events = [] }) {
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <FileTextIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">Recent Events</h3>
        </div>
        <Button as={Link} to="/events" variant="secondary" size="sm">
          View All Events
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2.5">Time</th>
              <th className="px-5 py-2.5">Event</th>
              <th className="px-5 py-2.5">Object</th>
              <th className="px-5 py-2.5">Track</th>
              <th className="px-5 py-2.5">Risk</th>
              <th className="px-5 py-2.5">Severity</th>
              <th className="px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((e) => (
                <tr
                  key={e.id || `${e.time}-${e.type}`}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">
                    {e.time}
                  </td>
                  <td className="px-5 py-2.5 text-slate-700">{e.type}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {e.objectType || "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {e.trackId != null ? e.trackId : "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5">
                    {e.riskScore != null ? (
                      <Badge tone={e.riskScore >= 60 ? "high" : e.riskScore >= 40 ? "medium" : "info"}>
                        {e.riskScore}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge tone={severityTone[e.severity] || "info"} dot>
                      {(e.severity || "info").toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge tone={statusTone[(e.status || "").toLowerCase()] || "default"}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-5 py-6 text-center text-sm text-slate-500">
                  No recent events for this camera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default CameraEvents;
