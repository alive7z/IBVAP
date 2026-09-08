import React from "react";

const dotColors = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  offline: "bg-slate-400",
};

const labelColors = {
  success: "text-slate-700",
  warning: "text-slate-700",
  danger: "text-red-700",
  info: "text-slate-700",
  offline: "text-slate-500",
};

/**
 * Status indicator: colored dot plus an explicit text label.
 * Both together to avoid relying on color alone.
 */
function StatusIndicator({ status = "info", label, pulse = false }) {
  const tone = dotColors[status] || dotColors.info;
  const text = labelColors[status] || labelColors.info;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${tone}`}
          />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone}`}
        />
      </span>
      {label && <span className={`text-sm font-medium ${text}`}>{label}</span>}
    </span>
  );
}

export default StatusIndicator;
