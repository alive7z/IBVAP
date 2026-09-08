import React from "react";
import {
  CameraIcon,
  BellIcon,
  AlertTriangleIcon,
  FileTextIcon,
  ActivityIcon,
} from "../common/Icons";

const iconMap = {
  cameras: CameraIcon,
  alerts: BellIcon,
  highRisk: AlertTriangleIcon,
  anpr: FileTextIcon,
  health: ActivityIcon,
};

const accentMap = {
  cameras: { bg: "bg-blue-50", text: "text-blue-700" },
  alerts: { bg: "bg-orange-50", text: "text-orange-600" },
  highRisk: { bg: "bg-red-50", text: "text-red-600" },
  anpr: { bg: "bg-green-50", text: "text-green-700" },
  health: { bg: "bg-green-50", text: "text-green-700" },
};

/**
 * KPI stat card: icon, primary value, supporting text, optional status.
 */
function StatCard({ type, icon, value, label, sub, status, statusText }) {
  const Icon = icon || iconMap[type] || ActivityIcon;
  const accent = accentMap[type] || accentMap.health;

  const statusTone =
    status === "healthy" || status === "online"
      ? "text-success"
      : status === "warning"
      ? "text-warning"
      : status === "critical"
      ? "text-danger"
      : "text-slate-500";

  return (
    <div className="card flex items-start gap-4 p-5">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accent.bg} ${accent.text}`}
      >
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tracking-tight text-slate-900">
          {value}
        </p>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        {statusText && (
          <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${statusTone}`}>
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status === "healthy"
                  ? "bg-success"
                  : status === "warning"
                  ? "bg-warning"
                  : status === "critical"
                  ? "bg-danger"
                  : "bg-slate-400"
              }`}
              aria-hidden="true"
            />
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}

export default StatCard;
