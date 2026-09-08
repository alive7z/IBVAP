import React from "react";
import ConfidenceBadge from "../ConfidenceBadge";
import { DetailRow, EvidenceImage, CameraButton, EventButton } from "../DetailBits";
import { formatDateTime } from "../../../utils/date";

/**
 * Face event detail. Face Detection only — no identity / match / recognition
 * results are shown.
 */
function FaceEventDetails({ event, eventType }) {
  return (
    <div>
      <dl className="divide-y divide-slate-100 text-sm">
        <DetailRow label="Face Event ID" value={event.id} />
        <DetailRow label="Person Track ID" value={event.trackId} />
        <DetailRow label="Camera" value={[event.cameraId, event.cameraName].filter(Boolean).join(" · ")} />
        <DetailRow label="Location" value={event.location} />
        <DetailRow label="Detection Confidence" value={<ConfidenceBadge value={event.confidence} />} />
        <DetailRow label="Timestamp" value={formatDateTime(event.timestamp)} />
      </dl>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Face Crop
          </p>
          <EvidenceImage evidenceId={event.evidenceId} alt={`Face detection ${event.id}`} />
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Detection metadata only. No recognition or person identity is performed.
      </p>

      <div className="mt-4">
        <CameraButton cameraId={event.cameraId} />
      </div>
      {event.relatedEventId && (
        <EventButton eventId={event.relatedEventId} eventType={eventType} />
      )}
    </div>
  );
}

export default FaceEventDetails;
