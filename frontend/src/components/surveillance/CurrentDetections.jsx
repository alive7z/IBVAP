import React from "react";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { BrainIcon } from "../common/Icons";

const kindLabel = { person: "Person", vehicle: "Vehicle" };

/**
 * Compact list of the currently tracked detections on a camera,
 * with confidence (and plate info for vehicles where available).
 */
function CurrentDetections({ detections = [] }) {
  if (!detections.length) {
    return (
      <Card>
        <div className="flex items-center gap-2">
          <BrainIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Current Detections
          </h3>
        </div>
        <p className="mt-3 text-sm text-slate-500">No active detections.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <BrainIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">
          Current Detections
        </h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {detections.map((d, i) => (
          <li key={i} className="py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">
                {kindLabel[d.kind] || d.label} #{d.trackId}
              </span>
              <Badge tone="info">{Math.round((d.confidence || 0) * 100)}%</Badge>
            </div>
            {d.plate && (
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono font-medium text-slate-700">
                  {d.plate}
                </span>
                <span>Confidence {Math.round((d.plateConfidence || 0) * 100)}%</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default CurrentDetections;
