import React from "react";
import Card from "../common/Card";
import { UserIcon } from "../common/Icons";
import { formatTime } from "../../utils/date";

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">
        {value == null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

/**
 * Object-specific information panel. Deliberately does not show person
 * identity: only Face Detected, never "Person Identified", until a real
 * face-recognition integration exists. Similarly vehicles are never labelled
 * blacklisted/wanted/stolen without an external database.
 */
function ObjectInformation({ event }) {
  const type = (event.type || "").toLowerCase();
  const obj = event.objectType?.toLowerCase();
  const isAnpr = type.includes("anpr") || obj === "plate";
  const isFace = type.includes("face");
  const isVehicle = obj === "vehicle";

  let title = "Object Information";
  if (isAnpr) title = "ANPR Details";
  else if (isFace) title = "Face Detection Details";

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <UserIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>

      {isAnpr && event.anpr ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Plate Number" value={event.anpr.plate} />
          <Row label="OCR Confidence" value={`${Math.round((event.anpr.ocrConfidence || 0) * 100)}%`} />
          <Row label="Vehicle Type" value={event.anpr.vehicleType} />
          <Row label="Vehicle Track" value={event.trackId} />
          <Row label="Camera" value={`${event.anpr.camera} · ${event.cameraName}`} />
          <Row label="Location" value={event.location} />
          <Row label="Timestamp" value={formatTime(event.anpr.timestamp)} />
        </dl>
      ) : isFace && event.face ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Face Event ID" value={event.face.faceEventId} />
          <Row label="Track ID" value={event.face.trackId} />
          <Row label="Detection Confidence" value={`${Math.round((event.face.confidence || 0) * 100)}%`} />
          <Row label="Timestamp" value={formatTime(event.face.timestamp)} />
          <dl className="pt-2">
            <p className="text-xs text-slate-400">
              Face detected — no identity match (person identification not yet integrated).
            </p>
          </dl>
        </dl>
      ) : isVehicle && event.object ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Track ID" value={event.trackId} />
          <Row label="Vehicle Type" value={event.object.vehicleType} />
          <Row label="Direction" value={event.object.direction} />
          <Row label="Confidence" value={`${Math.round((event.object.confidence || 0) * 100)}%`} />
        </dl>
      ) : isVehicle ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Track ID" value={event.trackId} />
          <Row label="Direction" value={event.context?.direction} />
          <Row label="Confidence" value={`${Math.round((event.confidence || 0) * 100)}%`} />
        </dl>
      ) : event.object ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Track ID" value={event.trackId} />
          <Row label="Confidence" value={`${Math.round((event.object.confidence != null ? event.object.confidence : event.confidence || 0) * 100)}%`} />
          <Row label="First Seen" value={event.object.firstSeen} />
          <Row label="Last Seen" value={event.object.lastSeen} />
          <Row label="Duration" value={event.object.duration} />
        </dl>
      ) : (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Track ID" value={event.trackId} />
          <Row label="Object Type" value={event.objectType} />
          <Row label="Confidence" value={`${Math.round((event.confidence || 0) * 100)}%`} />
        </dl>
      )}
    </Card>
  );
}

export default ObjectInformation;
