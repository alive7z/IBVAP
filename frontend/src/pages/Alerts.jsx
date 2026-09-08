import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Modal from "../components/common/Modal";
import Input from "../components/common/Input";
import { TableSkeleton } from "../components/common/Skeleton";
import EmptyState from "../components/common/EmptyState";
import AlertFilters from "../components/alerts/AlertFilters";
import AlertTable from "../components/alerts/AlertTable";
import { BellIcon, RefreshIcon, TrashIcon } from "../components/common/Icons";
import { getAlerts, getAlertsSummary, deleteAlert } from "../services/alertApi";
import { getAllCameras } from "../services/cameraApi";
import { getAllOperators } from "../services/operatorApi";
import { useRealtime } from "../context/RealtimeContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/common/Toast";
import { SOCKET_EVENTS } from "../services/websocket";

const PAGE_OPTIONS = [20, 50, 100];

const defaultFilters = {
  search: "",
  severity: "all",
  status: "all",
  eventType: "all",
  camera: "all",
  operator: "all",
  date: "all",
};

function SummaryCard({ label, value, counterClass }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className={`text-3xl font-bold ${counterClass}`}>{value ?? "—"}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [cameras, setCameras] = useState([]);
  const [operators, setOperators] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();
  const { subscribe, operationalDataEpoch } = useRealtime();
  const push = useToast();
  const canDelete = user?.roleKey === "ADMINISTRATOR";

  const handleAlertAcknowledged = (updated, previous) => {
    setAlerts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setSummary((current) => {
      if (!current) return current;
      const wasActive = ["new", "active"].includes(String(previous?.status || "").toLowerCase());
      const severity = String(previous?.severity || "").toLowerCase();
      return {
        ...current,
        totalActive: wasActive ? Math.max(0, current.totalActive - 1) : current.totalActive,
        [severity]: wasActive && current[severity] != null
          ? Math.max(0, current[severity] - 1)
          : current[severity],
        acknowledged: Number(current.acknowledged || 0) + 1,
      };
    });
    load(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAlert(deleteTarget.id, { reason: deleteReason });
      setAlerts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteReason("");
      push("Alert deleted.", "success");
      load(false);
    } catch (err) {
      push(err?.message || "Failed to delete alert.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback((showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(false);
    const params = { page, limit, sort: "created_at:desc" };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.severity !== "all") params.severity = filters.severity.toUpperCase();
    if (filters.status !== "all") params.status = filters.status.toUpperCase();
    if (filters.eventType !== "all") params.alertType = filters.eventType;
    if (filters.camera !== "all") params.cameraId = filters.camera;
    if (filters.operator !== "all") params.operatorId = filters.operator;
    if (filters.date !== "all") {
      const start = new Date();
      if (filters.date === "today") start.setHours(0, 0, 0, 0);
      if (filters.date === "24h") start.setTime(Date.now() - 24 * 60 * 60 * 1000);
      if (filters.date === "7d") start.setTime(Date.now() - 7 * 24 * 60 * 60 * 1000);
      params.startDate = start.toISOString();
    }
    const operatorRequest = canDelete ? getAllOperators() : Promise.resolve({ data: { items: [] } });
    Promise.all([getAlerts(params), getAlertsSummary(), getAllCameras(), operatorRequest])
      .then(([listRes, summaryRes, cameraRes, operatorRes]) => {
        setAlerts(listRes.data);
        setPagination(listRes.pagination);
        setSummary(summaryRes.data);
        setCameras((cameraRes.data || []).map((c) => c.cameraCode));
        setOperators(operatorRes.data?.items || []);
      })
      .catch(() => { setSummary(null); setError(true); })
      .finally(() => setLoading(false));
  }, [page, limit, filters, canDelete]);

  useEffect(() => { load(); }, [load, operationalDataEpoch]);

  // The REST query remains authoritative for filters, pagination and counters;
  // socket changes trigger a background refresh without a page reload.
  useEffect(() => {
    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_NEW, () => load(false)),
      subscribe(SOCKET_EVENTS.ALERT_UPDATED, () => load(false)),
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, () => load(false)),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, () => load(false)),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe, load]);

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Review and manage prioritized security incidents generated by the surveillance system."
      >
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshIcon size={15} /> Refresh
        </Button>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Total Active" value={summary?.totalActive} counterClass="text-slate-900" />
        <SummaryCard label="Critical" value={summary?.critical} counterClass="text-red-700" />
        <SummaryCard label="High" value={summary?.high} counterClass="text-red-600" />
        <SummaryCard label="Medium" value={summary?.medium} counterClass="text-orange-600" />
        <SummaryCard label="Acknowledged" value={summary?.acknowledged} counterClass="text-yellow-600" />
      </div>

      {/* Filter bar */}
      <div className="card mt-6 p-4">
        <AlertFilters filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} cameras={cameras} operators={operators} />
      </div>

      {/* Main list */}
      <div className="mt-6">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Active & Recent Alerts
        </h2>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : error ? (
          <EmptyState
            tone="error"
            icon={<BellIcon size={22} />}
            title="Unable to load alerts."
            description="There was a problem fetching alert data. Please try again."
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshIcon size={15} /> Retry
              </Button>
            }
          />
        ) : alerts.length ? (
          <>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Showing{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {alerts.length}
              </span>{" "}
              of {pagination.total || alerts.length} alerts
            </p>
            <AlertTable
              alerts={alerts}
              canDelete={canDelete}
              onDelete={setDeleteTarget}
              onAlertAcknowledged={handleAlertAcknowledged}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <select className="input-field w-auto" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} per page</option>)}
              </select>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-slate-500">Page {page} of {Math.max(1, pagination.totalPages || 0)}</span>
                <Button variant="secondary" size="sm" disabled={page >= (pagination.totalPages || 0)} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<BellIcon size={22} />}
            title="No alerts found"
            description="No security alerts match the selected filters."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(defaultFilters)}
              >
                Clear filters
              </Button>
            }
          />
        )}
      </div>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete Alert">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Delete alert{" "}
            <span className="font-semibold text-slate-700">{deleteTarget?.id}</span>? This is a
            soft delete — the alert is hidden from listings but its audit trail is preserved.
            Protected alerts must be unprotected first.
          </p>
          <Input
            id="alert-delete-reason"
            label="Deletion reason"
            placeholder="e.g. Incorrectly classified incident"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
              <TrashIcon size={14} /> Delete Alert
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Alerts;
