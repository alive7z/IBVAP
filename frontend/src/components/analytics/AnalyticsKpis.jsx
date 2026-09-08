import React from "react";
import Card from "../common/Card";
import { BellIcon, AlertTriangleIcon, ShieldIcon, ActivityIcon } from "../common/Icons";

function Kpi({ label, value, sub, icon, tone }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={`rounded-lg p-1.5 ${tone}`}>{icon}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

function AnalyticsKpis({ summary }) {
  const severityTotal = (summary.riskDistribution || []).reduce(
    (s, d) => s + (d.value || 0),
    0
  );
  const criticalHigh = (summary.riskDistribution || [])
    .filter((d) => ["CRITICAL", "HIGH"].includes(String(d.name).toUpperCase()))
    .reduce((s, d) => s + (d.value || 0), 0);
  const camHealth = summary.cameraHealth || [];
  const healthyCams = camHealth.filter((c) => (c.value || 0) >= 90).length;
  const avgHealth =
    camHealth.length > 0
      ? Math.round(camHealth.reduce((s, c) => s + (c.value || 0), 0) / camHealth.length)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Kpi
        label="Retained Alerts"
        value={severityTotal}
        sub="All severities"
        icon={<BellIcon size={16} className="text-blue-700" />}
        tone="bg-blue-50"
      />
      <Kpi
        label="High + Critical"
        value={criticalHigh}
        sub="Require attention"
        icon={<AlertTriangleIcon size={16} className="text-red-600" />}
        tone="bg-red-50"
      />
      <Kpi
        label="Avg Camera Health"
        value={`${avgHealth}%`}
        sub={`${healthyCams} of ${camHealth.length} healthy`}
        icon={<ActivityIcon size={16} className="text-green-600" />}
        tone="bg-green-50"
      />
      <Kpi
        label="Average Alert Risk"
        value={summary.averageRiskScore == null ? "—" : Number(summary.averageRiskScore).toFixed(1)}
        sub="Across retained alerts"
        icon={<ShieldIcon size={16} className="text-blue-700" />}
        tone="bg-blue-50"
      />
    </div>
  );
}

export default AnalyticsKpis;
