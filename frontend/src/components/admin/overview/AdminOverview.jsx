import React, { useCallback, useEffect, useState } from "react";
import Card from "../../common/Card";
import EmptyState from "../../common/EmptyState";
import { Skeleton } from "../../common/Skeleton";
import { LayoutDashboardIcon } from "../../common/Icons";
import { getAllOperators, getOperatorsAnalytics } from "../../../services/operatorApi";
import { getRetention } from "../../../services/retentionApi";
import { getAlertsSummary } from "../../../services/alertApi";
import { getOverviewAnalytics } from "../../../services/analyticsApi";
import { getSystemStatus } from "../../../services/cameraApi";
import { useRealtime } from "../../../context/RealtimeContext";

/**
 * Admin Overview pane: real aggregate KPIs (alerts, retention posture) plus
 * operator response-time analytics. No hardcoded/mock counters.
 */
function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { operationalDataEpoch } = useRealtime();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      getOperatorsAnalytics(),
      getRetention(),
      getAllOperators(),
      getAlertsSummary(),
      getOverviewAnalytics(),
      getSystemStatus(),
    ])
      .then(([ops, ret, operators, alertSummary, overview, health]) => {
        setData({
          operatorAnalytics: ops.data,
          retention: ret.data,
          operators: operators.data,
          alertSummary: alertSummary.data,
          overview: overview.data,
          health: health.data,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, operationalDataEpoch]);

  if (loading) {
    return (
      <Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="space-y-2 py-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <EmptyState
          tone="error"
          icon={<LayoutDashboardIcon size={22} />}
          title="Unable to load overview."
          description="There was a problem fetching administrative analytics."
        />
      </Card>
    );
  }

  const rt = data.operatorAnalytics.responseTime || {};
  const workload = data.operatorAnalytics.workload || [];
  const ret = data.retention;
  const overview = data.overview || {};
  const alertSummary = data.alertSummary || {};
  const operatorItems = data.operators?.items || [];
  const operatorTotal = data.operators?.pagination?.total ?? operatorItems.length;
  const activeOperators = operatorItems.filter((o) => o.status === "ACTIVE").length;
  const onlineOperators = operatorItems.filter((o) => o.onlineStatus === "ONLINE").length;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="sr-only">Administration Summary</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4">
          <PrimaryMetric
            label="Operators"
            value={`${activeOperators} / ${operatorTotal ?? "—"}`}
            detail={`Online: ${onlineOperators}`}
          />
          <PrimaryMetric
            label="Cameras"
            value={`${overview.cameras?.online ?? "—"} / ${overview.cameras?.total ?? "—"}`}
            detail="online / total"
          />
          <PrimaryMetric label="Events Today" value={overview.events?.today ?? "—"} />
          <PrimaryMetric label="Unacknowledged Alerts" value={alertSummary.totalActive ?? "—"} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SummaryPanel title="Alert Summary">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AlertMetric label="Medium" value={alertSummary.medium ?? "—"} tone="medium" />
            <AlertMetric label="High" value={alertSummary.high ?? "—"} tone="high" />
            <AlertMetric label="Critical" value={alertSummary.critical ?? "—"} tone="critical" />
            <AlertMetric
              label="Acknowledged"
              value={alertSummary.acknowledged ?? "—"}
              tone="acknowledged"
            />
          </div>
        </SummaryPanel>

        <SummaryPanel title="Operations">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InlineMetric
              label="Active Operators"
              value={activeOperators}
              detail={`Online: ${onlineOperators}`}
            />
            <InlineMetric label="Offline Cameras" value={overview.cameras?.offline ?? "—"} />
            <InlineMetric
              label="Avg Acknowledge"
              value={formatDuration(rt.avgAcknowledgeSeconds)}
            />
            <InlineMetric label="Avg Resolve" value={formatDuration(rt.avgResolveSeconds)} />
          </div>
        </SummaryPanel>
      </div>

      <SummaryPanel title="System Status">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SystemMetric label="Backend" status={data.health?.backend} />
          <SystemMetric label="AI Engine" status={data.health?.aiEngine} />
          <SystemMetric
            label="Cleanup"
            status={ret.settings?.autoCleanupEnabled ? "ENABLED" : "DISABLED"}
          />
          <SystemMetric label="Storage" value={formatBytes(ret.stats?.evidenceStorageBytes)} />
        </div>
      </SummaryPanel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-slate-800">Operator Workload</h3>
          <p className="text-sm text-slate-500">Acknowledged / resolved alerts per operator.</p>
          {workload.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No operator activity recorded yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                    <th className="px-3 py-2 font-semibold">Operator</th>
                    <th className="px-3 py-2 font-semibold text-right">Acknowledged</th>
                    <th className="px-3 py-2 font-semibold text-right">Resolved</th>
                    <th className="px-3 py-2 font-semibold text-right">Avg Ack</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((w) => (
                    <tr key={w.id} className="border-b border-slate-100">
                      <td className="px-3 py-2.5 text-slate-700">{w.fullName}</td>
                      <td className="px-3 py-2.5 text-right">{w.acknowledgedCount}</td>
                      <td className="px-3 py-2.5 text-right">{w.resolvedCount}</td>
                      <td className="px-3 py-2.5 text-right">
                        {w.avgAcknowledgeSeconds != null ? `${w.avgAcknowledgeSeconds}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-slate-800">Retention & Storage</h3>
          <p className="text-sm text-slate-500">Current cleanup policy and data volume.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <RetStat label="Max Normal Events" value={ret.settings?.maxNormalEvents} />
            <RetStat label="HIGH horizon" value={ret.settings?.highAlertHours ? `${ret.settings.highAlertHours}h` : "Keep all"} />
            <RetStat label="Events stored" value={ret.stats?.events} />
            <RetStat label="Protected events" value={ret.stats?.protectedEvents} />
            <RetStat label="Alerts stored" value={ret.stats?.alerts} />
            <RetStat label="Protected alerts" value={ret.stats?.protectedAlerts} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function formatBytes(value) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function formatDuration(value) {
  return value == null ? "—" : `${value}s`;
}

function SummaryPanel({ title, children }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </Card>
  );
}

function PrimaryMetric({ label, value, detail }) {
  return (
    <div className="min-w-0 bg-white px-3 py-3 sm:px-4">
      <p className="min-h-8 text-xs font-semibold uppercase leading-4 tracking-wide text-slate-500 lg:min-h-0">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold leading-none text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

const ALERT_TONES = {
  medium: { dot: "bg-amber-500", text: "text-amber-700" },
  high: { dot: "bg-orange-500", text: "text-orange-700" },
  critical: { dot: "bg-red-600", text: "text-red-700" },
  acknowledged: { dot: "bg-blue-600", text: "text-blue-700" },
};

function AlertMetric({ label, value, tone }) {
  const color = ALERT_TONES[tone] || ALERT_TONES.acknowledged;
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold uppercase leading-4 tracking-wide text-slate-600">
          {label}
        </span>
      </span>
      <span className={`text-lg font-bold ${color.text}`}>{value}</span>
    </div>
  );
}

function InlineMetric({ label, value, detail }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium leading-4 text-slate-500">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className="text-lg font-bold leading-tight text-slate-900">{value}</p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
    </div>
  );
}

function SystemMetric({ label, status, value }) {
  const normalized = String(status || "UNKNOWN").toUpperCase();
  const healthy = normalized === "HEALTHY" || normalized === "ENABLED";
  const warning = normalized === "DEGRADED";
  const unavailable = normalized === "OFFLINE" || normalized === "ERROR";
  const dot = healthy
    ? "bg-green-600"
    : warning
      ? "bg-amber-500"
      : unavailable
        ? "bg-red-600"
        : "bg-slate-400";
  const text = healthy
    ? "text-green-700"
    : warning
      ? "text-amber-700"
      : unavailable
        ? "text-red-700"
        : "text-slate-600";
  const displayValue = value || toDisplayStatus(normalized);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <span className="truncate text-xs font-medium text-slate-500">{label}</span>
      <span
        className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${value ? "text-slate-800" : text}`}
      >
        {!value && (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{displayValue}</span>
      </span>
    </div>
  );
}

function toDisplayStatus(value) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function RetStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xl font-bold text-slate-800">{value ?? "—"}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

export default AdminOverview;
