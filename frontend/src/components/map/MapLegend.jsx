import React from "react";

const legendItems = [
  { swatch: "bg-green-600", label: "Camera Online" },
  { swatch: "bg-slate-400", label: "Camera Offline" },
  { swatch: "bg-red-600", label: "Active Alert" },
  { swatch: "bg-blue-600 !rounded-full", label: "My Location" },
  { swatch: "bg-orange-500", label: "Warning" },
  { swatch: "bg-blue-700/30 border border-dashed border-blue-700/60", label: "Restricted Zone" },
  { swatch: "border-t-2 border-dashed border-indigo-500", label: "Virtual Fence" },
];

/**
 * Compact map legend (color + text, not color-only).
 */
function MapLegend() {
  return (
    <div className="card pointer-events-auto p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Legend
      </p>
      <ul className="space-y-1.5">
        {legendItems.map((it) => (
          <li key={it.label} className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className={`inline-block h-3 w-3 rounded-sm ${it.swatch} ${
                it.swatch.includes("border-t-2") ? "h-0" : ""
              }`}
              aria-hidden="true"
            />
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MapLegend;
