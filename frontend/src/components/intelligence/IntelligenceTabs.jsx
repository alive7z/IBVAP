import React from "react";

const tabs = [
  { id: "anpr", label: "ANPR" },
  { id: "face", label: "Face Events" },
  { id: "vehicle", label: "Vehicle Intelligence" },
];

/**
 * Clean tab row for switching intelligence views.
 */
function IntelligenceTabs({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            role="tab"
            aria-selected={selected}
            className={`btn-focus -mb-px whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              selected
                ? "border-blue-700 bg-white text-blue-700"
                : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default IntelligenceTabs;
