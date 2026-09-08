import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Badge from "../common/Badge";
import Loader from "../common/Loader";
import { ImageIcon, PlayIcon, CameraIcon } from "../common/Icons";
import { fetchEvidenceFileUrl } from "../../services/eventApi";
import { formatDateTime } from "../../utils/date";

/**
 * Evidence / camera snapshot panel for an event detail.
 * Renders the real stored evidence metadata (snapshots pulled from the
 * authenticated evidence-file endpoint as a blob URL). The placeholder grid is
 * only shown when no evidence exists for the event. Incident clips are listed
 * once clips are captured; a single snapshot is shown inline.
 */
function EventEvidence({ event, items }) {
  const evidence = items || [];
  const snapshot = evidence.find((i) => (i.type || "").toLowerCase() === "snapshot");
  const clip = evidence.find((i) => (i.type || "").toLowerCase() === "incident_clip");
  const face = evidence.find((i) => (i.type || "").toLowerCase() === "face");
  // Prefer the full-frame snapshot; fall back to the detection-only face crop.
  const primary = snapshot || face;

  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    let active = true;
    setSnapshotUrl(null);
    if (primary) {
      setLoadingUrl(true);
      fetchEvidenceFileUrl(primary.id)
        .then((url) => {
          if (active) setSnapshotUrl(url);
        })
        .catch(() => {
          /* evidence binary unavailable — placeholder grid remains */
        })
        .finally(() => {
          if (active) setLoadingUrl(false);
        });
    }
    return () => {
      active = false;
    };
  }, [primary?.id]);

  const evidenceTag = evidence[0]?.id || null;

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Event Evidence
          </h3>
        </div>
        {evidenceTag && <Badge tone="info">{evidenceTag}</Badge>}
      </div>

      <div className="p-5">
        <div
          className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 dark:bg-[#0b101a]"
          role="img"
          aria-label="Event evidence"
        >
          {snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={`Event evidence for ${event.camera}`}
              className="h-full w-full object-contain"
            />
          ) : loadingUrl ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <Loader size="sm" label="Loading evidence…" />
            </div>
          ) : (
            <>
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <CameraIcon size={36} />
                <p className="mt-2 text-xs">
                  {event.camera} · {event.cameraName || "No evidence captured yet"}
                </p>
              </div>
            </>
          )}
          {primary && primary.type  === "FACE" && (
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
              Face capture · detection only
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!snapshotUrl}>
            <ImageIcon size={14} /> View Snapshot
          </Button>
          {clip && (
            <Button variant="secondary" size="sm" disabled>
              <PlayIcon size={14} /> Play Clip
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Captured at {(snapshot && formatDateTime(snapshot.capturedAt)) || "—"} · Camera{" "}
          {event.camera} · {evidence.length > 0 ? `${evidence.length} evidence record(s)` : "No evidence for this event"}
        </p>
      </div>
    </Card>
  );
}

export default EventEvidence;
