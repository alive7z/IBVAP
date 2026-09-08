import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Card from "../components/common/Card";
import { RefreshIcon, AlertTriangleIcon } from "../components/common/Icons";
import AnalyticsKpis from "../components/analytics/AnalyticsKpis";
import EventsByTypeChart from "../components/analytics/EventsByTypeChart";
import AlertsByCameraChart from "../components/analytics/AlertsByCameraChart";
import AlertsBySeverityChart from "../components/analytics/AlertsBySeverityChart";
import EventsByTimeChart from "../components/analytics/EventsByTimeChart";
import AlertTrendChart from "../components/analytics/AlertTrendChart";
import CameraHealthCard from "../components/analytics/CameraHealthCard";
import { getAnalyticsSummary } from "../services/analyticsApi";
import { SkeletonCard } from "../components/common/Skeleton";

function InsightRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function Analytics() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getAnalyticsSummary()
      .then((res) => setSummary(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const insights = useMemo(() => {
    if (!summary) return [];
    const eventsByTime = summary.eventsByTime || [];
    const peak = eventsByTime.reduce(
      (best, d) => (d.count > best.count ? d : best),
      { hour: "—", count: 0 }
    );
    const topCamera = (summary.alertsByCamera || [])[0];
    const topType = (summary.eventsByType || [])[0];
    const statusSummary = (summary.alertStatusDistribution || [])
      .map((row) => `${row.status}: ${row.count}`)
      .join(" · ");
    return [
      { label: "Peak Event Window", value: `${peak.hour}:00 (${peak.count} events)` },
      { label: "Top Camera by Alerts", value: topCamera ? `${topCamera.name} (${topCamera.alerts})` : "—" },
      { label: "Top Event Type", value: topType ? `${topType.name} (${topType.value})` : "—" },
      { label: "Lowest Camera Health", value: lowestHealth(summary.cameraHealth) },
      { label: "Alert Statuses", value: statusSummary || "—" },
    ];
  }, [summary]);

  function lowestHealth(arr) {
    if (!arr || !arr.length) return "—";
    const min = arr.reduce((a, b) => (b.value < a.value ? b : a));
    return `${min.name} (${min.value}%)`;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" subtitle="Detection, alert and camera health analytics">
        <Button variant="secondary" size="sm" onClick={load} aria-label="Refresh analytics">
          <RefreshIcon size={15} /> Refresh
        </Button>
      </PageHeader>

      <AnalyticsKpis summary={summary || { riskDistribution: [], cameraHealth: [], eventsByType: [] }} />

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-28 animate-shimmer" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}

      {error && (
        <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertTriangleIcon size={30} className="text-red-500" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Unable to load analytics data.
          </p>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshIcon size={15} /> Retry
          </Button>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <EventsByTypeChart data={summary.eventsByType || []} />
            <AlertsBySeverityChart data={summary.riskDistribution || []} />
            <AlertsByCameraChart data={summary.alertsByCamera || []} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AlertTrendChart alertTrend={summary.alertTrend} />
            <EventsByTimeChart data={summary.eventsByTime || []} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CameraHealthCard data={summary.cameraHealth || []} />
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Insights</h3>
              <p className="mb-3 text-xs text-slate-500">
                Key observations derived from the current analytics window.
              </p>
              <div className="divide-y divide-slate-100">
                {insights.map((ins) => (
                  <InsightRow key={ins.label} label={ins.label} value={ins.value} />
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default Analytics;
