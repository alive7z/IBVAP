import React from "react";

/**
 * Lightweight accessible tooltip wrapper. Renders a small floating label on
 * hover/focus. Respects reduced motion via CSS.
 */
function Tooltip({ label, children, side = "bottom", className }) {
  const pos =
    side === "bottom"
      ? "top-full mt-1.5 left-1/2 -translate-x-1/2"
      : "left-full ml-2 top-1/2 -translate-y-1/2";
  return (
    <span className={`group/tip relative ${className || "inline-flex"}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 opacity-0 shadow-card transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${pos}`}
      >
        {label}
      </span>
    </span>
  );
}

export default Tooltip;
