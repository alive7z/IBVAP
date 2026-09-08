import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import EventTypeBadge from "./EventTypeBadge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import { LayersIcon } from "../common/Icons";
import { formatTime } from "../../utils/date";

/**
 * Small list of events related to the current one (same camera / nearby time),
 * helping show how multiple detections contribute to an incident.
 */
function RelatedEvents({ events }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <LayersIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Related Events</h3>
      </div>
      {events && events.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {events.slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link
                to={`/events/${e.id}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
              >
                <span className="font-medium text-blue-700 hover:underline">{e.id}</span>
                <span className="min-w-0 flex-1">
                  <EventTypeBadge type={e.type} />
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">
                  {formatTime(e.timestamp)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No related events.</p>
      )}
    </Card>
  );
}

export default RelatedEvents;
