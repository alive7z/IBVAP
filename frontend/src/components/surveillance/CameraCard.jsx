import React from "react";
import { Link } from "react-router-dom";
import CameraPreview from "./CameraPreview";
import Badge from "../common/Badge";
import StatusIndicator from "../common/StatusIndicator";
import { severityTone, statusTone } from "../../utils/severity";
import {
  MapPinIcon,
  ArrowRightIcon,
  MoreHorizontalIcon,
} from "../common/Icons";

function countByKind(detections = []) {
  return detections.reduce(
    (acc, d) => {
      if (d.kind === "person") acc.persons += 1;
      if (d.kind === "vehicle") acc.vehicles += 1;
      return acc;
    },
    { persons: 0, vehicles: 0 }
  );
}

/**
 * Individual camera card shown in the Live Surveillance grid.
 */
function CameraCard({ camera }) {
  const isOnline = camera.status === "online";
  const { persons, vehicles } = countByKind(camera.detections);
  const risk = camera.risk || camera.severity || "info";

  return (
    <div className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
      {/* Preview */}
      <Link
        to={`/surveillance/${camera.id}`}
        className="block"
        aria-label={`Open ${camera.id}`}
      >
        <CameraPreview camera={camera} showAlertBanner />
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-800">{camera.id}</p>
            <p className="truncate text-sm text-slate-500">{camera.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <MapPinIcon size={12} />
              <span className="truncate">{camera.sector || camera.location}</span>
            </p>
          </div>
          {isOnline ? (
            <StatusIndicator status="success" label="" />
          ) : (
            <StatusIndicator status="offline" label="" />
          )}
        </div>

        {/* Detections / risk row */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-slate-50 p-2">
            <p className="text-slate-500">Detections</p>
            <p className="mt-0.5 font-medium text-slate-700">
              {persons > 0 ? `${persons} Person${persons > 1 ? "s" : ""}` : "—"}
              {vehicles > 0 ? ` · ${vehicles} Vehicle${vehicles > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <div className="rounded-md bg-slate-50 p-2">
            <p className="text-slate-500">Risk</p>
            <div className="mt-0.5">
              <Badge tone={severityTone[risk] || "info"} dot>
                {(risk).toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Footer: last update + action */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-400">
            Updated <span className="font-medium text-slate-600">{camera.lastUpdate || "—"}</span>
          </p>
          <Link
            to={`/surveillance/${camera.id}`}
            className="btn-focus inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            View Camera
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CameraCard;
