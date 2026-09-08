import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import Modal from "../components/common/Modal";
import Input from "../components/common/Input";
import EventFilters from "../components/events/EventFilters";
import EventTable from "../components/events/EventTable";
import { FileTextIcon, DownloadIcon, ChevronDownIcon, RefreshIcon, AlertTriangleIcon, TrashIcon } from "../components/common/Icons";
import { getEvents, getEventsSummary, deleteEvent } from "../services/eventApi";
import { getAllCameras } from "../services/cameraApi";
import { useRealtime } from "../context/RealtimeContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/common/Toast";
import { SOCKET_EVENTS } from "../services/websocket";

const PAGE_OPTIONS = [20, 50, 100];

const defaultFilters = {
  search: "",
  type: "all",
  severity: "all",
  objectType: "all",
  minRisk: "",
  camera: "all",
  status: "all",
  date: "all",
};

function SummaryCard({ label, value }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className="text-3xl font-bold text-slate-900">{value ?? "—"}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [cameras, setCameras] = useState([]);
  const [summary, setSummary] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();
  const { subscribe, operationalDataEpoch } = useRealtime();
  const push = useToast();
  const canDelete = user?.roleKey === "ADMINISTRATOR";

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEvent(deleteTarget.id, { reason: deleteReason });
      setEvents((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteReason("");
      push("Event deleted.", "success");
      load(false);
    } catch (err) {
      push(err?.message || "Failed to delete event.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback((showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(false);
    const params = { page, limit, sort: "occurred_at:desc" };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.type !== "all") params.eventType = filters.type;
    if (filters.severity !== "all") params.severity = filters.severity.toUpperCase();
    if (filters.objectType !== "all") params.objectType = filters.objectType;
    if (filters.minRisk !== "") params.minRiskScore = filters.minRisk;
    if (filters.camera !== "all") params.cameraId = filters.camera;
    if (filters.status !== "all") params.status = filters.status.toUpperCase();
    if (filters.date !== "all") {
      const start = new Date();
      if (filters.date === "today") start.setHours(0, 0, 0, 0);
      if (filters.date === "24h") start.setTime(Date.now() - 24 * 60 * 60 * 1000);
      if (filters.date === "7d") start.setTime(Date.now() - 7 * 24 * 60 * 60 * 1000);
      params.startDate = start.toISOString();
    }
    Promise.all([getEvents(params), getEventsSummary(), getAllCameras()])
      .then(([res, summaryRes, cameraRes]) => {
        setEvents(Array.isArray(res.data) ? res.data : []);
        setPagination(res.pagination || {});
        setSummary(summaryRes.data);
        setCameras((cameraRes.data || []).map((c) => c.cameraCode));
      })
      .catch(() => { setSummary(null); setError(true); })
      .finally(() => setLoading(false));
  }, [page, limit, filters]);

  useEffect(() => { load(); }, [load, operationalDataEpoch]);

  // Keep server-side filters, totals and pagination authoritative after socket
  // changes, while updating without a browser refresh.
  useEffect(() => {
    const offs = [
      subscribe(SOCKET_EVENTS.EVENT_NEW, () => load(false)),
      subscribe(SOCKET_EVENTS.EVENT_UPDATED, () => load(false)),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe, load]);

  const pageCount = Math.max(1, pagination.totalPages || 0);
  const safePage = Math.min(page, pageCount);
  const visible = events;
  const from = pagination.total ? (safePage - 1) * limit + 1 : 0;
  const to = Math.min(safePage * limit, pagination.total || 0);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const total = pageCount;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - safePage) <= 1) nums.push(i);
    }
    const out = [];
    let prev = 0;
    nums.forEach((n) => {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    });
    return out;
  }, [pageCount, safePage]);

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Search and review surveillance events, detections, and security incidents."
      >
        <div className="relative">
          <Button variant="secondary" size="sm" disabled>
            <DownloadIcon size={15} /> Export <ChevronDownIcon size={14} />
          </Button>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshIcon size={15} /> Refresh
        </Button>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Events Today" value={summary?.totalToday} />
        <SummaryCard label="Security Events" value={summary?.securityEvents} />
        <SummaryCard label="ANPR Events" value={summary?.anprEvents} />
      </div>

      {/* Filter bar */}
      <div className="card mt-6 p-4">
        <EventFilters filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} cameras={cameras} />
      </div>

      {/* Event history */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Event History</h2>
          {!loading && !error && (
            <p className="text-sm text-slate-500">
              Showing{" "}
              <span className="font-medium text-slate-700">
                {from}–{to}
              </span>{" "}
              of {pagination.total || 0} events
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader label="Loading events..." />
          </div>
        ) : error ? (
          <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangleIcon size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              Unable to load event history.
            </p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : visible.length ? (
          <>
            <EventTable
              events={visible}
              canDelete={canDelete}
              onDelete={setDeleteTarget}
            />
            {pageCount > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Page {safePage} of {pageCount}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    className="btn-focus rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Previous
                  </button>
                  {pageNumbers.map((n, i) =>
                    n === "…" ? (
                      <span key={`e${i}`} className="px-1 text-xs text-slate-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`btn-focus rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          n === safePage
                            ? "border-blue-700 bg-blue-700 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    className="btn-focus rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <select className="input-field w-auto" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} per page</option>)}
              </select>
            </div>
          </>
        ) : (
          <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
            <FileTextIcon size={28} className="text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No events found</p>
            <p className="text-sm text-slate-500">
              No surveillance events match the selected filters.
            </p>
          </div>
        )}
      </div>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete Event">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Delete event{" "}
            <span className="font-semibold text-slate-700">{deleteTarget?.id}</span>? This is a
            soft delete — the event is hidden from listings and its audit trail is preserved.
            Protected events must be unprotected first.
          </p>
          <Input
            id="event-delete-reason"
            label="Deletion reason"
            placeholder="e.g. Incorrectly classified detection"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
              <TrashIcon size={14} /> Delete Event
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Events;
