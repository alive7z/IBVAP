import React from "react";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "operators", label: "Operators" },
  { id: "cameras", label: "Cameras" },
  { id: "zones", label: "Zones" },
  { id: "rules", label: "Risk Rules" },
  { id: "retention", label: "Retention & Storage" },
  { id: "health", label: "System Health" },
  { id: "audit", label: "Audit Logs" },
];

/**
 * Secondary navigation for the Admin area.
 * Keyboard-accessible tab list.
 */
function AdminTabs({ active, onChange, readOnly }) {
  return (
    <div
      role="tablist"
      aria-label="Administration sections"
      className="mb-6 flex flex-wrap gap-1 border-b border-slate-200"
    >
      {TABS.map((tab) => {
        const selected = active === tab.id;
        const showReadOnly =
          readOnly &&
          ["cameras", "operators", "retention"].includes(tab.id);

        return (
          <button
            key={tab.id}
            role="tab"
            id={`admin-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`admin-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`btn-focus inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium ${
              selected
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {tab.label}

            {showReadOnly && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                View Only
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default AdminTabs;
