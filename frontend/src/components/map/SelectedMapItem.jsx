import React from "react";
import Badge from "../common/Badge";
import Button from "../common/Button";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import { CameraIcon, AlertTriangleIcon, ShieldIcon, LayersIcon, XIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";

function Section({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value || "—"}</span>
    </div>
  );
}

const riskTone = (l) => {
  const v = String(l || "").toLowerCase();
  return v === "high" ? "high" : v === "medium" ? "medium" : v === "low" ? "low" : "info";
};

/**
 * Dynamically shows details for the currently selected map item
 * (camera / alert / zone / virtual fence).
 */
function SelectedMapItem({ item, onClose, actions }) {
  if (!item) return null;

  const icon =
    item.kind === "camera" ? (
      <CameraIcon size={16} className="text-blue-700" />
    ) : item.kind === "alert" ? (
      <AlertTriangleIcon size={16} className="text-red-600" />
    ) : item.kind === "zone" ? (
      <ShieldIcon size={16} className="text-blue-700" />
    ) : (
      <LayersIcon size={16} className="text-blue-700" />
    );

  return (
    <div className="card flex flex-col">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-slate-800">Selected</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-focus rounded p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Clear selection"
        >
          <XIcon size={16} />
        </button>
      </div>

      {item.kind === "camera" && (
        <>
          <p className="text-base font-bold text-blue-700">{item.id}</p>
          <p className="text-sm text-slate-600">{item.name}</p>
          <div className="mt-2 space-y-1">
            <Section label="Sector" value={item.sector} />
            <Section
              label="Status"
              value={
                <Badge tone={String(item.status).toLowerCase() === "online" ? "online" : "offline"}>
                  {item.status}
                </Badge>
              }
            />
            <Section
              label="Risk"
              value={
                <Badge tone={riskTone(item.risk)}>{(item.risk || "NORMAL").toUpperCase()}</Badge>
              }
            />
            <Section label="Last Update" value={item.lastUpdate} />
          </div>
          <div className="mt-3 flex gap-2">
            {actions.onViewCamera && (
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => actions.onViewCamera(item.id)}>
                View Live Feed
              </Button>
            )}
            {actions.onViewEvents && (
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => actions.onViewEvents(item.id)}>
                View Events
              </Button>
            )}
          </div>
        </>
      )}

      {item.kind === "alert" && (
        <>
          <p className="text-base font-bold text-red-700">{item.id}</p>
          <p className="text-sm text-slate-700">{item.type}</p>
          <div className="mt-2 space-y-1">
            <Section label="Severity" value={<AlertSeverityBadge severity={item.severity} />} />
            <Section label="Camera" value={item.cameraId} />
            <Section label="Sector" value={item.sector} />
            <Section label="Risk Score" value={`${item.riskScore ?? "—"} / 100`} />
            <Section label="Timestamp" value={formatDateTime(item.timestamp)} />
          </div>
          {actions.onViewAlert && (
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => actions.onViewAlert(item.id)}>
              View Alert
            </Button>
          )}
        </>
      )}

      {item.kind === "zone" && (
        <>
          <p className="text-base font-bold text-blue-700">{item.name}</p>
          <div className="mt-2 space-y-1">
            <Section label="Zone ID" value={item.id} />
            <Section label="Type" value={<Badge tone="new">{item.type}</Badge>} />
            <Section label="Camera" value={item.cameraId} />
            <Section label="Risk Level" value={<Badge tone={riskTone(item.riskLevel)}>{(item.riskLevel || "").toUpperCase()}</Badge>} />
          </div>
          {actions.onViewCamera && (
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => actions.onViewCamera(item.cameraId)}>
              View Camera
            </Button>
          )}
        </>
      )}

      {item.kind === "fence" && (
        <>
          <p className="text-base font-bold text-blue-700">{item.id}</p>
          <p className="text-sm text-slate-600">{item.name}</p>
          <div className="mt-2 space-y-1">
            <Section label="Camera" value={item.cameraId} />
            <Section label="Rule" value={item.rule} />
            <Section label="Status" value={<Badge tone="online">{item.status}</Badge>} />
          </div>
          {actions.onViewCamera && (
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => actions.onViewCamera(item.cameraId)}>
              View Camera
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default SelectedMapItem;
