import React from "react";
import DetectionOverlay from "./DetectionOverlay";
import { CameraIcon, VideoIcon } from "../common/Icons";
import useCameraPreviewUrl from "../../hooks/useCameraPreviewUrl";

/**
 * Surveillance preview for a camera card. Shows the live browser-compatible
 * MJPEG preview (proxied by the backend — never raw RTSP) with the AI detection
 * overlay, or a neutral placeholder when offline/unavailable. It never renders
 * fake imagery.
 */
function CameraPreview({ camera, showTrackId = false, showAlertBanner = false }) {
  const isOnline = camera.status === "online";
  const cameraCode = camera.cameraCode || camera.id;
  const { previewUrl, reportImageError } = useCameraPreviewUrl(cameraCode, isOnline);

  return (
    <div
      className="relative aspect-video w-full overflow-hidden bg-slate-900 dark:bg-[#0b101a]"
      role="img"
      aria-label={`${cameraCode} preview`}
    >
      {isOnline ? (
        <>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Live preview for ${cameraCode}`}
              onError={reportImageError}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
              <VideoIcon size={30} />
              <p className="mt-1.5 text-[11px] font-medium">{cameraCode}</p>
            </div>
          )}
          <DetectionOverlay detections={camera.detections || []} trackId={showTrackId} />

          {/* LIVE badge */}
          <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            LIVE
          </span>

          {/* Alert banner */}
          {showAlertBanner && camera.activeAlert && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center">
              <div className="flex items-center gap-1.5 rounded bg-red-600/95 px-2 py-1 text-[11px] font-bold uppercase text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                High Alert · {camera.activeAlert.type}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-slate-400 dark:bg-[#141c2b]">
            <CameraIcon size={30} />
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide">
              Camera Offline
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Last Seen {camera.lastSeen || camera.lastUpdate || "—"}
            </p>
          </div>
          <span className="absolute left-2 top-2 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            OFFLINE
          </span>
        </>
      )}
    </div>
  );
}

export default CameraPreview;
