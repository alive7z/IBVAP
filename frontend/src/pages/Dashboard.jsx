import React, { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import EmptyState from "../components/common/EmptyState";
import { AlertTriangleIcon } from "../components/common/Icons";
import { KpiSkeleton } from "../components/common/Skeleton";
import StatCard from "../components/dashboard/StatCard";
import LiveSurveillance from "../components/dashboard/LiveSurveillance";
import BorderMapPreview from "../components/dashboard/BorderMapPreview";
import AlertTrend from "../components/dashboard/AlertTrend";
import RiskDistribution from "../components/dashboard/RiskDistribution";
import RecentAlerts from "../components/dashboard/RecentAlerts";
import SystemHealth from "../components/dashboard/SystemHealth";
import IntelligenceSummary from "../components/dashboard/IntelligenceSummary";
import QuickActions from "../components/dashboard/QuickActions";
import { getSummary } from "../services/analyticsApi";
import { useRealtime } from "../context/RealtimeContext";
import { SOCKET_EVENTS } from "../services/websocket";

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { subscribe, operationalDataEpoch } = useRealtime();

  useEffect(() => {
    let active = true;
    getSummary()
      .then((res) => {
        if (!active) return;
        setSummary(res.data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [operationalDataEpoch]);

  // Realtime: keep KPI counters live without refetching the dashboard.
  useEffect(() => {
    const onAlertNew = (payload) => {
      const s = payload?.data?.status;
      if (!s || !["NEW", "ACTIVE"].includes(s)) return;
      setSummary((prev) =>
        prev ? { ...prev, activeAlerts: prev.activeAlerts + 1 } : prev
      );
    };
    const onAlertClosed = (payload) => {
      const s = payload?.data?.status;
      if (s !== "RESOLVED") return;
      setSummary((prev) =>
        prev ? { ...prev, activeAlerts: Math.max(0, prev.activeAlerts - 1) } : prev
      );
    };
    const onCameraStatus = (payload) => {
      const st = payload?.data?.streamStatus;
      if (!st) return;
      setSummary((prev) => {
        if (!prev) return prev;
        if (st === "ONLINE") return { ...prev, camerasOnline: prev.camerasOnline + 1 };
        if (st === "OFFLINE")
          return { ...prev, camerasOnline: Math.max(0, prev.camerasOnline - 1) };
        return prev;
      });
    };

    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_NEW, onAlertNew),
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, onAlertClosed),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, onAlertClosed),
      subscribe(SOCKET_EVENTS.CAMERA_STATUS, onCameraStatus),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe]);

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <div className="h-7 w-40 animate-shimmer rounded-md" />
          <div className="mt-2 h-4 w-64 animate-shimmer rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-72 animate-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          title="Overview"
          subtitle="Command dashboard – real-time border surveillance status"
        />
        <EmptyState
          icon={<AlertTriangleIcon size={22} />}
          tone="error"
          title="Could not load dashboard data"
          description="The backend API is unavailable. Check the service and try again."
        />
      </div>
    );
  }

  return (
    <div key={operationalDataEpoch}>
      <PageHeader
        title="Overview"
        subtitle="Command dashboard – real-time border surveillance status"
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          type="cameras"
          value={summary.camerasOnline}
          label="Active Cameras"
          sub={`Online: ${summary.camerasOnline} / ${summary.activeCameras}`}
        />
        <StatCard
          type="alerts"
          value={summary.activeAlerts}
          label="Active Alerts"
          sub="Requiring attention"
        />
        <StatCard
          type="highRisk"
          value={summary.highRiskEventsToday}
          label="High-Risk Events Today"
          sub="Critical + High severity"
        />
        <StatCard
          type="anpr"
          value={summary.anprDetections}
          label="ANPR Detections"
          sub="Last 24 hours"
        />
        <StatCard
          type="health"
          value={summary.systemHealth}
          label="System Health"
          sub={`Uptime ${summary.uptime}`}
          status={summary.systemHealth === "healthy" ? "healthy" : summary.systemHealth === "degraded" ? "warning" : "critical"}
          statusText={String(summary.systemHealth || "unknown").replace(/_/g, " ")}
        />
      </div>

      {/* Surveillance / map / trend */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <LiveSurveillance />
        </div>
        <div className="xl:col-span-1">
          <BorderMapPreview />
        </div>
        <div className="xl:col-span-1">
          <AlertTrend />
        </div>
      </div>

      {/* Recent alerts / risk + intelligence */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentAlerts />
        </div>
        <div className="space-y-6">
          <RiskDistribution />
          <IntelligenceSummary />
        </div>
      </div>

      {/* System health / quick actions */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SystemHealth />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
