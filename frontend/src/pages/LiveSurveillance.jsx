import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import CameraFilters from "../components/surveillance/CameraFilters";
import CameraGrid from "../components/surveillance/CameraGrid";
import {
  getAllCameras,
  fromSocketCamera,
  fetchRuntimeMap,
  mergeRuntimeCamera,
} from "../services/cameraApi";
import { useRealtime } from "../context/RealtimeContext";
import { SOCKET_EVENTS } from "../services/websocket";
import { upsertByKey } from "../utils/realtime";

// Single page-level sync cadence for live runtime state. NOT per-render: the
// grid never spawns per-card loops. Runtime truth comes from the backend
// runtime-status endpoint (Redis or the Python /health fallback).
const RUNTIME_SYNC_MS = 5000;

const defaultFilters = { search: "", status: "all", alert: "all", sector: "all" };

function SummaryCard({ label, value, tone }) {
  const toneCls = {
    success: "text-green-600",
    danger: "text-red-600",
    warning: "text-orange-600",
    slate: "text-slate-800",
  }[tone];
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className={`text-3xl font-bold ${toneCls}`}>{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function LiveSurveillance() {
  const [cameras, setCameras] = useState([]);
  const [runtimeById, setRuntimeById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);

  const load = () => {
    setLoading(true);
    setError(false);
    getAllCameras()
      .then((res) => setCameras(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const { subscribe } = useRealtime();

  // Realtime: apply camera status/update events by camera_code so ONLINE/OFFLINE
  // states change without a page refresh (metadata only, no streaming).
  useEffect(() => {
    const applyCamera = (payload) => {
      const item = fromSocketCamera(payload?.data);
      if (!item?.id) return;
      setCameras((prev) => upsertByKey(prev, item, "id"));
    };
    const offs = [
      subscribe(SOCKET_EVENTS.CAMERA_STATUS, applyCamera),
      subscribe(SOCKET_EVENTS.CAMERA_UPDATED, applyCamera),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe]);

  // Live runtime sync: one interval for the whole page (never per render/card).
  // Refreshes runtime-status for each enabled camera and merges runtime onto
  // the base list, so phone connect/disconnect reflects without a refresh.
  const camerasRef = useRef(cameras);
  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  const syncingRef = useRef(false);
  const syncRuntime = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const map = await fetchRuntimeMap(camerasRef.current);
      setRuntimeById((prev) => ({ ...prev, ...map }));
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    syncRuntime();
    const timer = setInterval(syncRuntime, RUNTIME_SYNC_MS);
    return () => clearInterval(timer);
  }, [syncRuntime, cameras.length]);

  // Merge: runtime state is the live truth when present; the static DB row is
  // the fallback. Missing runtime NEVER fabricates ONLINE. Disabled cameras are
  // left untouched so they cannot show stale/cached runtime.
  const merged = useMemo(
    () =>
      cameras.map((c) =>
        c.enabled ? mergeRuntimeCamera(c, runtimeById[c.id] || null) : c
      ),
    [cameras, runtimeById]
  );

  const sectors = useMemo(
    () => [...new Set(merged.map((c) => c.sector).filter(Boolean))],
    [merged]
  );

  const summary = useMemo(() => {
    const online = merged.filter((c) => c.status === "online").length;
    const activeAlert = merged.filter((c) => c.activeAlert).length;
    return {
      total: merged.length,
      online,
      offline: merged.length - online,
      activeAlert,
    };
  }, [merged]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return merged.filter((c) => {
      if (filters.status !== "all" && c.status !== filters.status) return false;
      if (filters.alert === "active" && !c.activeAlert) return false;
      if (filters.alert === "normal" && c.activeAlert) return false;
      if (filters.sector !== "all" && c.sector !== filters.sector) return false;
      if (
        q &&
        !`${c.id} ${c.name} ${c.location} ${c.sector}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [merged, filters]);

  return (
    <div>
      <PageHeader
        title="Live Surveillance"
        subtitle="Monitor real-time CCTV feeds, AI detections, and active security events."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Total Cameras" value={summary.total} tone="slate" />
        <SummaryCard label="Online" value={summary.online} tone="success" />
        <SummaryCard label="Offline" value={summary.offline} tone="danger" />
        <SummaryCard label="Active Alerts" value={summary.activeAlert} tone="warning" />
      </div>

      {/* Filter bar */}
      <div className="card mt-6 p-4">
        <CameraFilters filters={filters} onChange={setFilters} sectors={sectors} />
      </div>

      {/* Grid */}
      <div className="mt-6">
        {!loading && !error && (
          <p className="mb-4 text-sm text-slate-500">
            Showing <span className="font-medium text-slate-700">{filtered.length}</span>{" "}
            of {cameras.length} cameras
          </p>
        )}
        <CameraGrid
          cameras={filtered}
          loading={loading}
          error={error}
          onRetry={load}
        />
      </div>
    </div>
  );
}

export default LiveSurveillance;
