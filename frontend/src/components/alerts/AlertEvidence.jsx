import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Badge from "../common/Badge";
import Loader from "../common/Loader";
import { ImageIcon, PlayIcon, CameraIcon, FileTextIcon } from "../common/Icons";
import { getAlertEvidence, fetchEvidenceFileUrl } from "../../services/eventApi";
import { formatDateTime } from "../../utils/date";

/**
 * Large evidence / snapshot panel for an alert. Fetches the alert's stored
 * evidence (GET /api/alerts/:id/evidence) and renders the real snapshot via an
 * authenticated blob URL; the placeholder grid remains only when nothing was
 * captured.
 */
function AlertEvidence({ alert }) {
  const [items, setItems] = useState([]);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    let active = true;
    getAlertEvidence(alert.id)
      .then((res) => active && setItems(res.data || []))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [alert.id]);

  const snapshot = items.find((i) => (i.type || "").toLowerCase() === "snapshot");
  const clip = items.find((i) => (i.type || "").toLowerCase() === "incident_clip");

  useEffect(() => {
    let active = true;
    setSnapshotUrl(null);
    setLoadingUrl(Boolean(snapshot));
    if (snapshot) {
      fetchEvidenceFileUrl(snapshot.id)
        .then((url) => active && setSnapshotUrl(url))
        .catch(() => {})
        .finally(() => active && setLoadingUrl(false));
    }
    return () => {
      active = false;
    };
  }, [snapshot?.id]);

  const evidenceId = snapshot?.id || items[0]?.id || "EVD-00000";
  const isVehicle = alert.objectType?.toLowerCase() === "vehicle";

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Incident Snapshot
          </h3>
        </div>
        <Badge tone="info">{evidenceId}</Badge>
      </div>

      <div className="p-5">
        <div
          className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 dark:bg-[#0b101a]"
          role="img"
          aria-label="Incident snapshot"
        >
          {snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={`Incident snapshot for ${alert.camera}`}
              className="h-full w-full object-contain"
            />
          ) : loadingUrl ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <Loader size="sm" label="Loading snapshot…" />
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
                <p className="mt-2 text-xs">{alert.camera} · {alert.cameraName}</p>
              </div>

              {/* Detection overlay */}
              <div
                className="absolute"
                style={{
                  left: isVehicle ? "24%" : "14%",
                  top: isVehicle ? "52%" : "20%",
                  width: isVehicle ? "34%" : "18%",
                  height: isVehicle ? "20%" : "36%",
                  border: "2px solid #a3e635",
                }}
                aria-hidden="true"
              >
                <span className="absolute -top-5 left-0 rounded-sm bg-lime-500 px-1 text-[10px] font-bold uppercase text-slate-900">
                  {alert.objectType || "OBJECT"} {alert.trackId ? `#${alert.trackId.split("-").pop()}` : ""}
                </span>
              </div>

              {/* Zone boundary */}
              <div
                className="pointer-events-none absolute inset-x-6 top-6 bottom-6 rounded border border-dashed border-lime-300/40"
                aria-hidden="true"
              >
                <span className="absolute -top-3 left-2 rounded bg-lime-300/20 px-1.5 py-0.5 text-[10px] uppercase text-lime-200">
                  Restricted Zone Boundary
                </span>
              </div>

              {/* Timestamp */}
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {snapshot?.capturedAt || alert.timestamp}
              </span>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!snapshotUrl}>
            <FileTextIcon size={14} /> View Snapshot
          </Button>
          {clip && (
            <Button variant="secondary" size="sm" disabled>
              <PlayIcon size={14} /> Play Incident Clip
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Evidence {evidenceId} · Captured at {snapshot ? formatDateTime(snapshot.capturedAt) : "—"} · Camera {alert.camera}
        </p>
      </div>
    </Card>
  );
}

export default AlertEvidence;