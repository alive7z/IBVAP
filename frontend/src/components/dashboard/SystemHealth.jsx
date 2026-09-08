import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Loader from "../common/Loader";
import { ActivityIcon } from "../common/Icons";
import { getSystemStatus } from "../../services/cameraApi";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";

const toneMap = (status) => {
  switch (status) {
    case "HEALTHY":
      return { dot: "bg-success", text: "text-success" };
    case "DEGRADED":
      return { dot: "bg-warning", text: "text-warning" };
    case "OFFLINE":
      return { dot: "bg-danger", text: "text-danger" };
    default:
      return { dot: "bg-slate-400", text: "text-slate-500" };
  }
};

/**
 * Compact system health panel, backed by the real /api/system/status probes.
 * Camera connectivity is clearly labeled as the last recorded database state.
 */
function SystemHealth() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let active = true;
    getSystemStatus()
      .then((health) => {
        if (!active) return;
        const h = health.data || {};
        const cameras = h.cameras?.recordedState || {};
        const cameraStatus = h.cameraRtsp || (cameras.total === 0 ? "UNKNOWN" : cameras.online === cameras.total ? "HEALTHY" : cameras.online > 0 ? "DEGRADED" : "OFFLINE");
        setRows([
          {
            name: "Camera / RTSP",
            status: cameraStatus,
            detail: `${cameras.online || 0} / ${cameras.total || 0} recorded online · live AI probe`,
          },
          { name: "Backend API", status: h.backend || "UNKNOWN", detail: "Application process" },
          { name: "SQL Database", status: h.database || "UNKNOWN", detail: "Persistent storage" },
          { name: "AI Engine", status: h.aiEngine || "UNKNOWN", detail: "Internal health probe" },
          { name: "Redis", status: h.redis || "UNKNOWN", detail: "Optional runtime cache" },
          { name: "Evidence Storage", status: h.evidenceStorage || "UNKNOWN", detail: "Readable and writable media root" },
          { name: "Socket.IO", status: h.socketIo || "UNKNOWN", detail: "Realtime server" },
        ]);
      })
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const { subscribe } = useRealtime();

  // Realtime: when the server pushes a system status, update the API row.
  useEffect(() => {
    return subscribe(SOCKET_EVENTS.SYSTEM_STATUS, (payload) => {
      const st = payload?.data?.status;
      if (!st) return;
      setRows((prev) =>
        prev.map((r) =>
          r.name === "Backend API"
            ? { ...r, status: st === "healthy" ? "HEALTHY" : "DEGRADED", detail: r.detail }
            : r
        )
      );
    });
  }, [subscribe]);

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <ActivityIcon size={18} className="text-blue-700" />
        <h3 className="text-sm font-semibold text-slate-800">System Health</h3>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          System health is unavailable right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const tone = toneMap(s.status);
            return (
              <li
                key={s.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm text-slate-700">{s.name}</span>
                </span>
                <span className="text-right">
                  <span className={`block text-sm font-medium ${tone.text}`}>
                    {s.status}
                  </span>
                  <span className="block text-xs text-slate-400">{s.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default SystemHealth;
