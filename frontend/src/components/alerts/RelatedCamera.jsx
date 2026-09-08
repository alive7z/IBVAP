import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import StatusIndicator from "../common/StatusIndicator";
import AlertSeverityBadge from "./AlertSeverityBadge";
import { VideoIcon, MapPinIcon } from "../common/Icons";

/**
 * Compact related-camera panel. 'camera' is provided by the detail page
 * (fetched through cameraApi). Falls back to alert fields when absent.
 */
function RelatedCamera({ camera, alert }) {
  const isOnline = camera?.status === "online";
  const id = camera?.id || alert.camera;
  const name = camera?.name || alert.cameraName;
  const risk = camera?.risk || camera?.severity || alert.severity;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <VideoIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Related Camera</h3>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <VideoIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{id}</p>
          <p className="flex items-center gap-1 truncate text-xs text-slate-500">
            <MapPinIcon size={12} /> {name}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {camera ? (
          <StatusIndicator
            status={isOnline ? "success" : "offline"}
            label={isOnline ? "Online" : "Offline"}
          />
        ) : (
          <span className="text-sm text-slate-500">—</span>
        )}
        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">Risk</span>
          <AlertSeverityBadge severity={risk} />
        </span>
      </div>
      <Link
        to={`/surveillance/${id}`}
        className="btn-focus mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <VideoIcon size={16} className="text-blue-700" /> Open Live Camera
      </Link>
    </Card>
  );
}

export default RelatedCamera;
