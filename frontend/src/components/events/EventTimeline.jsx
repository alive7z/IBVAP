import React from "react";
import Card from "../common/Card";
import { ClockIcon } from "../common/Icons";
import { formatTime } from "../../utils/date";

/**
 * Visual event timeline. Falls back to a derived timeline (detection ->
 * security event) when the event does not carry an explicit one.
 */
function EventTimeline({ event }) {
  const explicit = event.timeline && event.timeline.length;
  const timeline = explicit
    ? event.timeline
    : [
        { time: formatTime(event.timestamp), event: "Detection recorded" },
        { time: formatTime(event.timestamp), event: `${event.type || "Event"} logged` },
      ];

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <ClockIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Event Timeline</h3>
      </div>
      <ol className="relative ml-2 border-l-2 border-slate-200">
        {timeline.map((t, i) => (
          <li key={i} className="relative pb-5 pl-6 last:pb-0">
            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white bg-blue-500 ring-2 ring-blue-500/20" />
            <p className="text-xs font-medium text-slate-400">{t.time}</p>
            <p className="text-sm font-medium text-slate-800">{t.event}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default EventTimeline;
