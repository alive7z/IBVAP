import React from "react";
import ConfidenceBadge from "../ConfidenceBadge";
import { DetailRow, CameraButton, EventButton } from "../DetailBits";
import { formatDateTime } from "../../../utils/date";

/**
 * Vehicle intelligence detail. Vehicles are never labelled as blacklisted /
 * wanted / stolen — only as plates read by the system.
 */
function VehicleDetails({ vehicle, eventType }) {
  return (
    <div>
      <dl className="divide-y divide-slate-100 text-sm">
        <DetailRow label="Vehicle Track ID" value={vehicle.trackId} />
        <DetailRow label="Vehicle Type" value={vehicle.vehicleType} />
        <DetailRow label="Detection Confidence" value={<ConfidenceBadge value={vehicle.confidence} />} />
        <DetailRow label="Camera" value={[vehicle.cameraId, vehicle.cameraName].filter(Boolean).join(" · ")} />
        <DetailRow label="Location" value={vehicle.location} />
        <DetailRow label="Plate Number" value={vehicle.plateNumber || "—"} />
        <DetailRow label="Timestamp" value={formatDateTime(vehicle.timestamp)} />
      </dl>

      <div className="mt-4">
        <CameraButton cameraId={vehicle.cameraId} />
      </div>
      {vehicle.relatedEventId && (
        <EventButton eventId={vehicle.relatedEventId} eventType={eventType} />
      )}
    </div>
  );
}

export default VehicleDetails;
