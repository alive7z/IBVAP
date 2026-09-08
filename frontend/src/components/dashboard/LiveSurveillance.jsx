import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../common/Badge";
import StatusIndicator from "../common/StatusIndicator";
import CameraPreview from "../surveillance/CameraPreview";
import {
  getCameraById,
  getCameraRuntimeStatus,
  mergeRuntimeCamera,
} from "../../services/cameraApi";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";
import {
  MaximizeIcon,
  PauseIcon,
  PlayIcon,
  CameraIcon,
  MapPinIcon,
  VideoIcon,
} from "../common/Icons";

const CAMERA_CODE = "CAM-01";
const RUNTIME_SYNC_MS = 5000;

function PreviewMessage({ title, detail, onRetry }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center bg-slate-900 px-4 text-center text-slate-400 dark:bg-[#0b101a]">
      <VideoIcon size={34} />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide">{title}</p>
      {detail && <p className="mt-1 text-[11px] text-slate-500">{detail}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-focus mt-3 rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * CAM-01 dashboard preview. It deliberately reuses the same safe camera
 * runtime + short-lived MJPEG preview flow as the Surveillance pages.
 */
function LiveSurveillance() {
  const [camera, setCamera] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const { subscribe } = useRealtime();

  const loadCamera = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(false);
    try {
      const [cameraResponse, runtime] = await Promise.all([
        getCameraById(CAMERA_CODE),
        getCameraRuntimeStatus(CAMERA_CODE).catch(() => null),
      ]);
      setCamera(
        runtime
          ? mergeRuntimeCamera(cameraResponse.data, runtime)
          : cameraResponse.data
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncRuntime = useCallback(async () => {
    try {
      const runtime = await getCameraRuntimeStatus(CAMERA_CODE);
      if (runtime) {
        setCamera((current) =>
          current ? mergeRuntimeCamera(current, runtime) : current
        );
      }
    } catch {
      // Keep the last safe state; the next poll or socket event retries it.
    }
  }, []);

  useEffect(() => {
    loadCamera(true);
  }, [loadCamera]);

  // Match Surveillance: runtime status is authoritative and is refreshed even
  // when Redis/Socket.IO is unavailable, so an offline card can recover.
  useEffect(() => {
    const timer = setInterval(syncRuntime, RUNTIME_SYNC_MS);
    return () => clearInterval(timer);
  }, [syncRuntime]);

  useEffect(() => {
    const refreshVisibleCamera = (payload) => {
      if (payload?.data?.cameraCode === CAMERA_CODE) syncRuntime();
    };
    const offs = [
      subscribe(SOCKET_EVENTS.CAMERA_STATUS, refreshVisibleCamera),
      subscribe(SOCKET_EVENTS.CAMERA_UPDATED, refreshVisibleCamera),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe, syncRuntime]);

  const isOnline = camera?.status === "online";
  const isTransitioning = ["connecting", "degraded", "reconnecting"].includes(
    camera?.status
  );
  const location =
    camera?.sector || camera?.location || camera?.name || "Location unavailable";
  const badgeLabel = paused
    ? "PAUSED"
    : loading
      ? "LOADING"
      : error
        ? "UNAVAILABLE"
        : isOnline
          ? "LIVE"
          : isTransitioning
            ? camera.status.toUpperCase()
            : "OFFLINE";
  const badgeTone =
    !paused && isOnline
      ? "danger"
      : loading || isTransitioning
        ? "warning"
        : "offline";

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <CameraIcon size={18} className="text-blue-700" />
          <h3 className="text-sm font-semibold text-slate-800">Live Surveillance</h3>
          <Badge tone={badgeTone} dot>
            {badgeLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((current) => !current)}
            disabled={!camera || error}
            className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <Link
            to={`/surveillance/${CAMERA_CODE}`}
            className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <MaximizeIcon size={14} /> Expand
          </Link>
        </div>
      </div>

      <div className="p-5">
        <div className="overflow-hidden rounded-lg">
          {paused ? (
            <PreviewMessage title="Feed Paused" detail={`${CAMERA_CODE} preview paused`} />
          ) : loading ? (
            <PreviewMessage title="Loading Preview" detail={`Connecting to ${CAMERA_CODE}`} />
          ) : error || !camera ? (
            <PreviewMessage
              title="Preview Unavailable"
              detail={`Unable to load ${CAMERA_CODE}`}
              onRetry={() => loadCamera(true)}
            />
          ) : (
            <CameraPreview camera={camera} showAlertBanner />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-600">
              <CameraIcon size={15} className="text-slate-400" />
              <span className="font-medium text-slate-800">{camera?.id || CAMERA_CODE}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <MapPinIcon size={15} className="shrink-0 text-slate-400" />
              <span className="truncate">{location}</span>
            </span>
          </div>
          {isOnline ? (
            <StatusIndicator status="success" label="Online" pulse={!paused} />
          ) : isTransitioning ? (
            <StatusIndicator status="warning" label={camera.status.toUpperCase()} />
          ) : (
            <StatusIndicator status="offline" label="Offline" />
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveSurveillance;
