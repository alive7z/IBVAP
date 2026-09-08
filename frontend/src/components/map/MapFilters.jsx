import React from "react";
import { SearchIcon } from "../common/Icons";

/**
 * Compact filters above/beside the map: search + sector + camera status +
 * alert severity.
 */
function MapFilters({ filters, onChange, sectors, onSearch, actions }) {
  const sectorOptions = sectors || [];
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const selectCls = "input-field w-auto min-w-[150px] shrink-0 !py-1.5 pr-7 text-xs";

  return (
    <div className="card pointer-events-auto flex w-full min-w-0 flex-wrap items-center gap-2 p-2.5">
      <div className="relative flex min-w-[260px] flex-1 items-center gap-1">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 shrink-0 text-slate-400"
        />
        <input
          type="search"
          className="input-field min-w-0 flex-1 !py-1.5 !pl-8 text-xs"
          placeholder="Search camera, sector, alert..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onSearch) onSearch(filters.search);
          }}
          onBlur={() => {
            if (onSearch && filters.search) onSearch(filters.search);
          }}
          aria-label="Search map"
        />
        {onSearch && (
          <button
            type="button"
            onClick={() => onSearch(filters.search)}
            className="btn-focus shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Go
          </button>
        )}
      </div>
      <select
        className={selectCls}
        value={filters.sector}
        onChange={(e) => set("sector", e.target.value)}
        aria-label="Filter by sector"
      >
        <option value="all">All Sectors</option>
        {sectorOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by camera status"
      >
        <option value="all">All Status</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
        <option value="alert">Alert Active</option>
      </select>

      <select
        className={selectCls}
        value={filters.severity}
        onChange={(e) => set("severity", e.target.value)}
        aria-label="Filter by alert severity"
      >
        <option value="all">All Severity</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      {actions}
    </div>
  );
}

export default MapFilters;
