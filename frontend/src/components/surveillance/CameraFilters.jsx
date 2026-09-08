import React from "react";
import { SearchIcon } from "../common/Icons";

/**
 * Compact filter bar for the camera grid: search + status/alert/sector selects.
 * Controlled so the parent page owns filter state.
 */
function CameraFilters({ filters, onChange, sectors }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  const selectCls =
    "input-field w-auto !py-2 pr-8 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative min-w-[220px] flex-1 sm:flex-none">
        <SearchIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          className="input-field !pl-9"
          placeholder="Search camera ID or location..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Search cameras"
        />
      </div>

      <select
        className={selectCls}
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All Status</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>

      <select
        className={selectCls}
        value={filters.alert}
        onChange={(e) => set("alert", e.target.value)}
        aria-label="Filter by alert state"
      >
        <option value="all">All Alert</option>
        <option value="active">Alert Active</option>
        <option value="normal">Normal</option>
      </select>

      <select
        className={selectCls}
        value={filters.sector}
        onChange={(e) => set("sector", e.target.value)}
        aria-label="Filter by sector"
      >
        <option value="all">All Sectors</option>
        {sectors.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

export default CameraFilters;
