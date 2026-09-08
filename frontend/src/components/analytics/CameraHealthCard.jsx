import React from "react";
import ChartCard from "./ChartCard";

function colorFor(value) {
  if (value >= 95) return "bg-green-500";
  if (value >= 85) return "bg-yellow-500";
  return "bg-red-500";
}

/**
 * Horizontal health bars per camera (uptime / health percentage).
 */
function CameraHealthCard({ data = [] }) {
  return (
    <ChartCard title="Camera Health" subtitle="Stream health score per camera">
      <ul className="space-y-3">
        {data.map((c) => {
          const v = Math.max(0, Math.min(100, c.value || 0));
          return (
            <li key={c.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{c.name}</span>
                <span className="text-slate-500">{v}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${colorFor(v)}`}
                  style={{ width: `${v}%` }}
                  role="progressbar"
                  aria-valuenow={v}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${c.name} health`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

export default CameraHealthCard;
