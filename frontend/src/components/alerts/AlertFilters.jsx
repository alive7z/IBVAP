import React from "react";
import { SearchIcon } from "../common/Icons";

const severityOptions = ["critical", "high", "medium", "low", "info"];
const eventTypeOptions = [
  ["SUSPICIOUS_ACTIVITY", "Suspicious Activity"],
  ["RESTRICTED_ZONE_ENTRY", "Restricted Zone Intrusion"],
  ["VIRTUAL_FENCE_CROSSING", "Virtual Fence Crossing"],
  ["NIGHT_MOVEMENT", "Night Movement"],
  ["LOITERING", "Loitering"],
  ["VEHICLE_IN_RESTRICTED_ZONE", "Vehicle in Restricted Zone"],
];
const dateOptions = ["today", "24h", "7d"];

const placeholderSeverity = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Compact filter bar for the alerts list.
 */
function AlertFilters({ filters, onChange, cameras, operators = [] }) {
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
          placeholder="Search alert ID, camera, location..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Search alerts"
        />
      </div>

      <select
        className={selectCls}
        value={filters.severity}
        onChange={(e) => set("severity", e.target.value)}
        aria-label="Filter by severity"
      >
        <option value="all">All Severities</option>
        {severityOptions.map((s) => (
          <option key={s} value={s}>
            {placeholderSeverity(s)}
          </option>
        ))}
      </select>

      {operators.length > 0 && (
        <select
          className={selectCls}
          value={filters.operator}
          onChange={(e) => set("operator", e.target.value)}
          aria-label="Filter by operator"
        >
          <option value="all">All Operators</option>
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id}>
              {operator.fullName || operator.email}
            </option>
          ))}
        </select>
      )}

      <select
        className={selectCls}
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All Status</option>
        <option value="new">New</option>
        <option value="active">Active</option>
        <option value="acknowledged">Acknowledged</option>
        <option value="investigating">Investigating</option>
        <option value="resolved">Resolved</option>
      </select>

      <select
        className={selectCls}
        value={filters.eventType}
        onChange={(e) => set("eventType", e.target.value)}
        aria-label="Filter by event type"
      >
        <option value="all">All Events</option>
        {eventTypeOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.camera}
        onChange={(e) => set("camera", e.target.value)}
        aria-label="Filter by camera"
      >
        <option value="all">All Cameras</option>
        {cameras.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.date}
        onChange={(e) => set("date", e.target.value)}
        aria-label="Filter by date"
      >
        <option value="all">Any Date</option>
        {dateOptions.map((d) => (
          <option key={d} value={d}>
            {d === "today" ? "Today" : d === "24h" ? "Last 24 Hours" : d === "7d" ? "Last 7 Days" : "Custom"}
          </option>
        ))}
      </select>
    </div>
  );
}

export default AlertFilters;
