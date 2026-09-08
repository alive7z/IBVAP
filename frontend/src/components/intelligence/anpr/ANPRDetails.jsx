import React from "react";
import ConfidenceBadge, { ocrQuality, confidencePercent } from "../ConfidenceBadge";
import { DetailRow, Snapshot, CroppedImage, CameraButton, EventButton } from "../DetailBits";
import { formatDateTime } from "../../../utils/date";

function ANPRDetails({ event, eventType }) {
  const pct = confidencePercent(event.confidence);
  const low = ocrQuality(pct) === "low";

  return (
    <div>
      <dl className="divide-y divide-slate-100 text-sm">
        <DetailRow label="Plate Number" value={event.plateNumber} />
        <DetailRow label="OCR Confidence" value={<ConfidenceBadge value={event.confidence} />} />
        <DetailRow label="Raw OCR Text" value={event.rawText} />
        <DetailRow label="Vehicle Type" value={event.vehicleType || "—"} />
        <DetailRow label="Vehicle Track ID" value={event.vehicleTrackId} />
        <DetailRow label="Camera" value={[event.cameraId, event.cameraName].filter(Boolean).join(" · ")} />
        <DetailRow label="Location" value={event.location} />
        <DetailRow label="Timestamp" value={formatDateTime(event.timestamp)} />
      </dl>

      {low && (
        <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          OCR confidence is below the 75% UI medium band. This record still reflects only the validator-confirmed OCR result.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Vehicle Snapshot
          </p>
          <Snapshot label="Vehicle Snapshot" sublabel={`${event.cameraId} · ${event.cameraName}`} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Plate Crop
          </p>
          <CroppedImage label="Plate Crop" sublabel={event.plateNumber} />
        </div>
      </div>

      <div className="mt-4">
        <CameraButton cameraId={event.cameraId} />
      </div>
      {event.relatedEventId && (
        <EventButton eventId={event.relatedEventId} eventType={eventType} />
      )}
    </div>
  );
}

export default ANPRDetails;
