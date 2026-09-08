import request from "./api";
import { getAllCameras } from "./cameraApi";

const SEVERITY_COLORS = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#10b981",
  INFO: "#64748b",
};

function fmtUptime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Dashboard KPIs: derive from real overview + health + plates count.
export async function getSummary() {
  const [overview, health, plates] = await Promise.all([
    request("/api/analytics/overview"),
    request("/api/health"),
    request("/api/intelligence/plates?limit=1"),
  ]);

  const o = overview.data || {};
  const h = health.data || {};
  const anpr = plates.data?.pagination?.total ?? 0;

  return {
    success: true,
    data: {
      activeCameras: o.cameras?.total || 0,
      camerasOnline: o.cameras?.online || 0,
      activeAlerts: o.alerts?.active || 0,
      highRiskEventsToday: o.events?.highRiskToday || 0,
      anprDetections: anpr,
      systemHealth: h.status || "unknown",
      uptime: fmtUptime(h.uptime),
    },
  };
}

export function getOverviewAnalytics() {
  return request("/api/analytics/overview");
}

// Analytics page chart datasets. Charts that the backend cannot supply are
// derived from real endpoint data (documented inline).
export async function getAnalyticsSummary() {
  const [events, alerts, cameras, cameraList] = await Promise.all([
    request("/api/analytics/events?limit=1000"),
    request("/api/analytics/alerts?limit=1000"),
    request("/api/analytics/cameras"),
    getAllCameras(),
  ]);

  const ev = events.data || {};
  const al = alerts.data || {};
  const ca = cameras.data || {};
  const allCameras = cameraList.data || [];

  // eventsByType: [{name,value}]
  const eventsByType = (ev.byType || []).map((r) => ({
    name: r.event_type,
    value: Number(r.count),
  }));

  // riskDistribution: [{name,value,color}] from alert severity counts.
  const riskDistribution = (al.bySeverity || []).map((r) => ({
    name: r.severity,
    value: Number(r.count),
    color: SEVERITY_COLORS[r.severity] || "#64748b",
  }));

  // alertsByCamera: [{name,alerts}]
  const alertsByCamera = (ca.alertsPerCamera || []).map((r) => ({
    name: r.camera_name || r.camera_code,
    alerts: Number(r.count),
  }));

  // alertTrend comes directly from daily + severity SQL groups.
  const overTime = al.overTime || [];
  const series = { Critical: [], High: [], Medium: [], Low: [] };
  const days = [...new Set(overTime.map((d) => String(d.date)))];
  days.forEach((day) => {
    Object.keys(series).forEach((key) => {
      const match = overTime.find((d) => String(d.date) === day && String(d.severity).toUpperCase() === key.toUpperCase());
      series[key].push(Number(match?.count || 0));
    });
  });
  const alertTrend = { days, series };

  // eventsByTime: hourly histogram returned by SQL (not a truncated list).
  const hourCounts = new Array(24).fill(0);
  (ev.byHour || []).forEach((row) => { hourCounts[Number(row.hour)] = Number(row.count); });
  const eventsByTime = hourCounts.map((count, h) => ({
    hour: String(h).padStart(2, "0"),
    count,
  }));

  // cameraHealth: [% healthy] derived from real online/offline status.
  const camStatus = allCameras.map((c) => ({
    name: c.name || c.cameraCode,
    value: c.streamStatus === "ONLINE" ? 100 : 0,
  }));

  return {
    success: true,
    data: {
      eventsByType,
      riskDistribution,
      alertsByCamera,
      alertTrend,
      eventsByTime,
      cameraHealth: camStatus,
      alertStatusDistribution: al.byStatus || [],
      averageRiskScore: al.average?.average_risk_score ?? null,
    },
  };
}
