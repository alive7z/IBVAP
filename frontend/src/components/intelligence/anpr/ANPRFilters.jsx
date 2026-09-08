import React from "react";
import { SearchIcon } from "../../common/Icons";

const vehicleTypes = ["Car", "Truck", "Bus", "Motorcycle", "Bicycle", "Other"];
const dateOptions = [
  { value: "all", label: "Any Date" },
  { value: "today", label: "Today" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "custom", label: "Custom Range" },
];

/**
 * ANPR filter bar.
 */
function ANPRFilters({ filters, onChange, cameras }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const selectCls = "input-field w-auto !py-2 pr-8 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1 sm:flex-none">
        <SearchIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          className="input-field !pl-9"
          placeholder="Search plate number..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Search ANPR events"
        />
      </div>

      <select
        className={selectCls}
        value={filters.camera}
        onChange={(e) => set("camera", e.target.value)}
        aria-label="Filter ANPR by camera"
      >
        <option value="all">All Cameras</option>
        {cameras.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {filters.date === "custom" && (
        <>
          <input type="date" className={selectCls} value={filters.startDate || ""} onChange={(e) => set("startDate", e.target.value)} aria-label="ANPR start date" />
          <input type="date" className={selectCls} value={filters.endDate || ""} onChange={(e) => set("endDate", e.target.value)} aria-label="ANPR end date" />
        </>
      )}

      <select
        className={selectCls}
        value={filters.confidence}
        onChange={(e) => set("confidence", e.target.value)}
        aria-label="Filter by OCR confidence"
      >
        <option value="all">All Confidence</option>
        <option value="high">High (90–100%)</option>
        <option value="medium">Medium (75–89%)</option>
        <option value="low">Low (&lt;75%)</option>
      </select>

      <select
        className={selectCls}
        value={filters.vehicleType}
        onChange={(e) => set("vehicleType", e.target.value)}
        aria-label="Filter by vehicle type"
      >
        <option value="all">All Vehicle Types</option>
        {vehicleTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.date}
        onChange={(e) => set("date", e.target.value)}
        aria-label="Filter ANPR by date"
      >
        {dateOptions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ANPRFilters;
