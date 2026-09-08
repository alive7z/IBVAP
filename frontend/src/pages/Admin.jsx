import React, { useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import { ShieldIcon } from "../components/common/Icons";
import { ToastProvider } from "../components/common/Toast";
import AdminTabs from "../components/admin/AdminTabs";
import { useAdminAccess, OPERATOR_ROLE } from "../components/admin/useAdminAccess";
import AdminOverview from "../components/admin/overview/AdminOverview";
import CameraManagement from "../components/admin/cameras/CameraManagement";
import ZoneManagement from "../components/admin/zones/ZoneManagement";
import RiskRules from "../components/admin/rules/RiskRules";
import OperatorManagement from "../components/admin/operators/OperatorManagement";
import RetentionSettings from "../components/admin/retention/RetentionSettings";
import AuditLogs from "../components/admin/audit/AuditLogs";
import { getMyOperatorAnalytics } from "../services/operatorApi";
import SystemHealth from "../components/dashboard/SystemHealth";

const PANELS = {
  overview: AdminOverview,
  cameras: CameraManagement,
  zones: ZoneManagement,
  rules: RiskRules,
  operators: OperatorManagement,
  retention: RetentionSettings,
  health: SystemHealth,
  audit: AuditLogs,
};

function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <ShieldIcon size={24} className="text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your role does not permit access to system administration.
        </p>
      </Card>
    </div>
  );
}

// Lightweight operator self-console shown to SECURITY_OPERATOR who land on the
// Admin route: their camera assignments + personal analytics (read-only).
export function OperatorConsole() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    getMyOperatorAnalytics()
      .then((res) => setAnalytics(res.data))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operator Console"
        subtitle="Your assigned cameras and personal alert-response analytics."
      />
      {loading ? (
        <Card>
          <Loader label="Loading your console..." />
        </Card>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OperatorKpi label="Assigned Cameras" value={analytics.assignedCameras?.length ?? 0} />
            <OperatorKpi label="Alerts Received" value={analytics.analytics?.alertsReceived ?? 0} />
            <OperatorKpi label="Alerts Acknowledged" value={analytics.analytics?.alertsAcknowledged ?? 0} />
            <OperatorKpi label="MEDIUM Acknowledged" value={analytics.analytics?.mediumAcknowledged ?? 0} />
            <OperatorKpi label="HIGH Acknowledged" value={analytics.analytics?.highAcknowledged ?? 0} />
            <OperatorKpi label="Critical Escalations" value={analytics.analytics?.criticalEscalated ?? 0} />
            <OperatorKpi label="Alerts Resolved" value={analytics.analytics?.alertsResolved ?? 0} />
            <OperatorKpi label="Pending Alerts" value={analytics.analytics?.pendingAlerts ?? 0} />
            <OperatorKpi label="Average Acknowledge" value={analytics.analytics?.avgAcknowledgeMinutes != null ? `${analytics.analytics.avgAcknowledgeMinutes}m` : "—"} />
            <OperatorKpi label="Average Resolve" value={analytics.analytics?.avgResolveMinutes != null ? `${analytics.analytics.avgResolveMinutes}m` : "—"} />
          </div>
          <Card>
            <h3 className="text-base font-semibold text-slate-800">Assigned Cameras</h3>
            <p className="text-sm text-slate-500">
              Cameras you are responsible for monitoring.
            </p>
            {analytics.assignedCameras?.length ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.assignedCameras.map((c) => (
                  <div
                    key={c.cameraCode}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="font-medium text-slate-800">{c.name || c.cameraCode}</p>
                    <p className="text-xs text-slate-500">
                      {c.cameraCode} · {c.locationName || "—"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                No cameras assigned yet. Contact an administrator.
              </p>
            )}
          </Card>
        </>
      ) : (
        <Card className="text-center text-sm text-slate-500">
          Unable to load your operator console.
        </Card>
      )}
    </div>
  );
}

function OperatorKpi({ label, value }) {
  return (
    <Card>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
    </Card>
  );
}

function AdminContent({ readOnly }) {
  const [active, setActive] = useState("overview");
  const Panel = PANELS[active] || PANELS.overview;

  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="Manage cameras, operators, retention, and platform settings."
      />
      <AdminTabs active={active} onChange={setActive} readOnly={readOnly} />
      <div key={active} role="tabpanel" id={`admin-panel-${active}`} aria-labelledby={`admin-tab-${active}`}>
        <Panel readOnly={readOnly} />
      </div>
    </div>
  );
}

function Admin() {
  const { role, canManage } = useAdminAccess();

  // Security Operator gets a self-service console instead of admin management.
  if (role === OPERATOR_ROLE) {
    return (
      <ToastProvider>
        <OperatorConsole />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AdminContent readOnly={!canManage} />
    </ToastProvider>
  );
}

export default Admin;
