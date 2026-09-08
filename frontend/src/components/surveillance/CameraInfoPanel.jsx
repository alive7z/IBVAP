import React from "react";
import Card from "../common/Card";
import StatusIndicator from "../common/StatusIndicator";
import { CameraIcon, MapPinIcon } from "../common/Icons";

function Row({ label, value, status, statusTone }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      {status ? (
        <StatusIndicator status={statusTone} label={value} />
      ) : (
        <span className="text-sm font-medium text-slate-800">{value}</span>
      )}
    </div>
  );
}

/**
 * Side panel with static camera metadata.
 */
function CameraInfoPanel({ camera }) {
  const isOnline = camera.status === "online";
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <CameraIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">Camera Information</h3>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        <Row label="Camera ID" value={camera.id} />
        <Row label="Location" value={camera.name} />
        <Row label="Sector" value={camera.sector || camera.location} />
        <Row
          label="Status"
          value={isOnline ? "Online" : "Offline"}
          status
          statusTone={isOnline ? "success" : "offline"}
        />
        <Row label="FPS" value={isOnline && camera.fps != null ? camera.fps : "—"} />
        <Row label="Latency" value={isOnline && camera.latency != null ? `${camera.latency} ms` : "—"} />
        <Row label="Active Tracks" value={camera.detections?.length || 0} />
        <Row label="Stream" value={isOnline ? "Connected" : "Disconnected"} />
      </dl>
    </Card>
  );
}

export default CameraInfoPanel;
