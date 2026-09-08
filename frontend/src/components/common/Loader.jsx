import React from "react";

/**
 * Accessible spinner with an optional message.
 */
function Loader({ size = "md", label = "Loading...", className = "" }) {
  const px = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 ${className}`}
      aria-live="polite"
    >
      <span
        className={`${px} animate-spin rounded-full border-2 border-blue-200 border-t-blue-700`}
        aria-hidden="true"
      />
      {label && <span className="text-sm text-slate-500">{label}</span>}
    </div>
  );
}

export default Loader;
