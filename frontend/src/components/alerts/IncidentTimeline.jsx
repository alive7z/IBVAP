import React from "react";
import Card from "../common/Card";
import { ClockIcon } from "../common/Icons";

/**
 * Visual incident timeline: Detection → Context → Behavior → Risk → Action.
 */
function IncidentTimeline({ alert }) {
  const timeline = alert.timeline || [];
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <ClockIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">
          Incident Timeline
        </h3>
      </div>
      {timeline.length ? (
        <ol className="relative ml-2 border-l-2 border-slate-200">
          {timeline.map((t, i) => (
            <li key={i} className="relative pb-5 pl-6 last:pb-0">
              <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white bg-blue-500 ring-2 ring-blue-500/20" />
              <p className="text-xs font-medium text-slate-400">{t.time}</p>
              <p className="text-sm font-medium text-slate-800">{t.event}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-500">No timeline available.</p>
      )}
    </Card>
  );
}

export default IncidentTimeline;
