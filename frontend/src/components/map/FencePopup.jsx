import React from "react";
import Badge from "../common/Badge";
import { LayersIcon } from "../common/Icons";

/**
 * Virtual fence popup.
 */
function FencePopup({ fence }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <LayersIcon size={15} className="text-blue-700" />
        <p className="text-sm font-bold text-slate-900">{fence.id}</p>
      </div>
      <p className="text-sm text-slate-600">{fence.name}</p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Camera:</span>
          <span className="font-medium text-slate-700">{fence.cameraId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Rule:</span>
          <span className="text-slate-700">{fence.rule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status:</span>
          <Badge tone="online">{fence.status}</Badge>
        </div>
      </div>
    </div>
  );
}

export default FencePopup;
