import React from "react";
import Badge from "../common/Badge";
import { CameraIcon } from "../common/Icons";
import { formatTime } from "../../utils/date";

/**
 * Compact camera popup rendered inside a Leaflet popup.
 */
function CameraPopup({ camera, onViewCamera, onViewEvents }) {
  const status = String(camera.status || "").toLowerCase();
  const risk = String(camera.risk || "normal").toLowerCase();
  const online = status === "online";
  const riskTone =
    risk === "high" ? "high" : risk === "medium" ? "medium" : risk === "low" ? "low" : "info";
  const personCount = (camera.detections || []).filter((d) => d.kind === "person").length;
  const vehicleCount = (camera.detections || []).filter((d) => d.kind === "vehicle").length;

  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <CameraIcon size={16} className="text-blue-700" />
        <p className="text-sm font-bold text-slate-900">{camera.id}</p>
      </div>
      <p className="text-sm text-slate-600">{camera.name}</p>
      <p className="text-xs text-slate-400">{camera.sector}</p>

      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status:</span>
          <Badge tone={online ? "online" : "offline"}>
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Risk:</span>
          <Badge tone={riskTone}>{(camera.risk || "NORMAL").toUpperCase()}</Badge>
        </div>
        {online && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Detections:</span>
            <span className="text-slate-700">
              {personCount} Person{personCount !== 1 ? "s" : ""} · {vehicleCount} Vehicle
              {vehicleCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Last Update:</span>
          <span className="text-slate-700">{formatTime(camera.lastUpdate || camera.lastSeen)}</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onViewCamera}
          className="btn-focus inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          View Camera
        </button>
        <button
          type="button"
          onClick={onViewEvents}
          className="btn-focus inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          View Events
        </button>
      </div>
    </div>
  );
}

export default CameraPopup;
