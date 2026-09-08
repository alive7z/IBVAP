import React from "react";
import { SearchIcon } from "../common/Icons";

const eventTypeOptions = [
  ["PERSON_DETECTED", "Person Detection"],
  ["VEHICLE_DETECTED", "Vehicle Detection"],
  ["PLATE_DETECTED", "ANPR Detection"],
  ["FACE_DETECTED", "Face Detection"],
  ["NIGHT_MOVEMENT", "Night Movement"],
  ["LOITERING", "Loitering"],
  ["RESTRICTED_ZONE_ENTRY", "Restricted Zone Intrusion"],
  ["VIRTUAL_FENCE_CROSSING", "Virtual Fence Crossing"],
  ["VEHICLE_IN_RESTRICTED_ZONE", "Vehicle in Restricted Zone"],
  ["SUSPICIOUS_ACTIVITY", "Suspicious Activity"],
];

const severityOptions = ["info", "low", "medium", "high", "critical"];
const statusOptions = [
  ["NEW", "New"],
  ["ACTIVE", "Active"],
  ["ACKNOWLEDGED", "Acknowledged"],
  ["RESOLVED", "Resolved"],
];
const dateOptions = [
  { value: "all", label: "Any Date" },
  { value: "today", label: "Today" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Compact filter bar for the events history list.
 */
function EventFilters({ filters, onChange, cameras }) {
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
          placeholder="Search event ID, camera, object, plate..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Search events"
        />
      </div>

      <select
        className={selectCls}
        value={filters.type}
        onChange={(e) => set("type", e.target.value)}
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
        value={filters.severity}
        onChange={(e) => set("severity", e.target.value)}
        aria-label="Filter by severity"
      >
        <option value="all">All Severities</option>
        {severityOptions.map((s) => (
          <option key={s} value={s}>
            {cap(s)}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.objectType}
        onChange={(e) => set("objectType", e.target.value)}
        aria-label="Filter by object type"
      >
        <option value="all">All Objects</option>
        <option value="PERSON">Person</option>
        <option value="VEHICLE">Vehicle</option>
        <option value="FACE">Face</option>
        <option value="PLATE">Plate</option>
      </select>

      <input
        type="number"
        min="0"
        max="100"
        className="input-field w-32 !py-2 text-sm"
        placeholder="Min risk"
        value={filters.minRisk}
        onChange={(e) => set("minRisk", e.target.value)}
        aria-label="Minimum risk score"
      />

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
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All Status</option>
        {statusOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.date}
        onChange={(e) => set("date", e.target.value)}
        aria-label="Filter by date"
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

export default EventFilters;
