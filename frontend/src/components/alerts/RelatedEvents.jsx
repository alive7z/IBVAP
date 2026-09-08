import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import AlertSeverityBadge from "./AlertSeverityBadge";
import Button from "../common/Button";
import { FileTextIcon } from "../common/Icons";

/**
 * Related events table for an alert.
 */
function RelatedEvents({ alert }) {
  const events = alert.relatedEvents || [];
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <FileTextIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">Related Events</h3>
        </div>
        <Button as={Link} to="/events" variant="secondary" size="sm">
          View Event History
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2.5">Time</th>
              <th className="px-5 py-2.5">Event</th>
              <th className="px-5 py-2.5">Severity</th>
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((e, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">
                    {e.time}
                  </td>
                  <td className="px-5 py-2.5 text-slate-700">{e.type}</td>
                  <td className="px-5 py-2.5">
                    <AlertSeverityBadge severity={e.severity} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="px-5 py-6 text-center text-sm text-slate-500">
                  No related events.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default RelatedEvents;
