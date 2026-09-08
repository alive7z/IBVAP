import React, { useCallback, useEffect, useState } from "react";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Input from "../../common/Input";
import Modal from "../../common/Modal";
import EmptyState from "../../common/EmptyState";
import { TableSkeleton } from "../../common/Skeleton";
import { FileTextIcon, RefreshIcon, TrashIcon } from "../../common/Icons";
import { getAuditLogs, getAuditLogStats, cleanupAuditLogs } from "../../../services/auditApi";
import { useToast } from "../../common/Toast";
import { formatDateTime } from "../../../utils/date";

const PAGE_OPTIONS = [20, 50, 100];

/**
 * Audit log viewer (Administrator + Auditor / Analyst). Server-side filtered +
 * paginated against the real audit_logs table. The oldest rows beyond the
 * retention cap can be cleaned by an Administrator.
 */
function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [stats, setStats] = useState({ total: 0, maxRows: 2000 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [cleaning, setCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const push = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = { page, limit };
    if (actionFilter.trim()) params.action = actionFilter.trim().toUpperCase();
    if (entityFilter.trim()) params.entityType = entityFilter.trim().toLowerCase();
    if (userFilter.trim()) params.userId = userFilter.trim();
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = nextDate(endDate);
    Promise.all([getAuditLogs(params), getAuditLogStats()])
      .then(([listRes, statsRes]) => {
        setLogs(listRes.data.items || []);
        setPagination(listRes.data.pagination || { page: 1, limit, total: 0 });
        setStats(statsRes.data || { total: 0, maxRows: 2000 });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, limit, actionFilter, entityFilter, userFilter, startDate, endDate]);

  useEffect(load, [load]);

  const reset = () => {
    setActionFilter("");
    setEntityFilter("");
    setUserFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await cleanupAuditLogs();
      setCleanResult(res.data);
      push("Audit log cleanup completed.", "success");
      await load();
    } catch (err) {
      push(err?.message || "Audit log cleanup failed.", "error");
    } finally {
      setCleaning(false);
      setConfirmOpen(false);
    }
  };

  const totalPages = pagination.totalPages || 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Audit Logs</h3>
          <p className="text-sm text-slate-500">
            Immutable record of administrative and operational actions.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Current Records:{" "}
            <span className="font-semibold text-slate-800">
              {stats.total.toLocaleString()}
            </span>{" "}
            / {stats.maxRows.toLocaleString()}
            {stats.total > stats.maxRows && (
              <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {stats.total - stats.maxRows} over cap
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setConfirmOpen(true);
            }}
            disabled={cleaning}
          >
            <TrashIcon size={15} /> Clean Old Audit Logs
          </Button>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshIcon size={15} /> Refresh
          </Button>
        </div>
      </div>

      {cleanResult && cleanResult.removedCount > 0 && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Cleanup removed{" "}
          <span className="font-semibold">{cleanResult.removedCount.toLocaleString()}</span>{" "}
          stale record(s); audit log trimmed to{" "}
          <span className="font-semibold">{cleanResult.afterCount?.toLocaleString()}</span>.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          id="audit-action"
          label="Action"
          placeholder="e.g. ALERT_ACKNOWLEDGED"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
        />
        <Input
          id="audit-entity"
          label="Entity Type"
          placeholder="e.g. alert"
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
        />
        <Input
          id="audit-user"
          label="Actor User ID"
          type="number"
          placeholder="e.g. 42"
          value={userFilter}
          onChange={(e) => {
            setUserFilter(e.target.value);
            setPage(1);
          }}
        />
        <Input
          id="audit-start-date"
          label="From Date"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
        />
        <Input
          id="audit-end-date"
          label="Through Date"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
        />
        <div>
          <label htmlFor="audit-limit" className="mb-1.5 block text-sm font-medium text-slate-700">
            Page Size
          </label>
          <select
            id="audit-limit"
            className="input-field"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : error ? (
          <EmptyState
            tone="error"
            icon={<FileTextIcon size={22} />}
            title="Unable to load audit logs."
            description="There was a problem fetching the audit trail."
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshIcon size={15} /> Retry
              </Button>
            }
          />
        ) : logs.length === 0 ? (
          <EmptyState icon={<FileTextIcon size={22} />} title="No audit records" description="No log entries match the current filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Actor</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Entity</th>
                    <th className="px-3 py-2 font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                        {formatDateTime(a.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-slate-700">{a.userName || "System"}</p>
                        {a.userEmail && <p className="text-xs text-slate-400">{a.userEmail}</p>}
                        {a.actorRole && <p className="text-xs text-slate-400">{a.actorRole.replace(/_/g, " ")}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                          {a.action}
                        </code>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {a.entityType ? `${a.entityType}:${a.entityId || "—"}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{a.ipAddress || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {Math.max(1, totalPages)} · {pagination.total} records
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Clean old audit logs">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            This permanently removes the oldest audit records beyond the{" "}
            <span className="font-semibold text-slate-700">
              {stats.maxRows.toLocaleString()}
            </span>{" "}
            record cap, keeping the newest logs. A single{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">AUDIT_RETENTION_CLEANUP</code>{" "}
            entry records the action.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={cleaning} onClick={handleCleanup}>
              <TrashIcon size={14} /> Clean {stats.total > stats.maxRows ? stats.total - stats.maxRows : 0} Records
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export default AuditLogs;

function nextDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
