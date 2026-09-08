import React from "react";
import { VideoIcon } from "../common/Icons";

/**
 * Placeholder CCTV frame used in place of a real RTSP feed.
 * Optionally renders a proposed AI bounding box to illustrate detection.
 */
function PlaceholderCamera({
  label,
  showBoxes = true,
  className = "",
  aspect = "video",
  children,
}) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-900 dark:bg-[#0b101a] ${className}`}
      role="img"
      aria-label={label || "Surveillance camera placeholder feed"}
    >
      {/* Subtle scan-grid look (static, no animation) */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-slate-400"
        aria-hidden="true"
      >
        <VideoIcon size={34} />
        <p className="mt-2 text-xs font-medium tracking-wide">
          {label || "Live Feed"}
        </p>
      </div>

      {showBoxes && (
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute left-[18%] top-[26%] h-16 w-32 rounded border-2 border-lime-400">
            <span className="absolute -top-5 left-0 rounded-sm bg-lime-500 px-1 text-[10px] font-bold uppercase text-slate-900">
              Person
            </span>
          </div>
          <div className="absolute right-[14%] bottom-[20%] h-20 w-40 rounded border-2 border-sky-400">
            <span className="absolute -top-5 left-0 rounded-sm bg-sky-500 px-1 text-[10px] font-bold uppercase text-slate-900">
              Vehicle
            </span>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

export default PlaceholderCamera;
