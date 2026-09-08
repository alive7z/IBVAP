import React, { useCallback, useEffect, useState } from "react";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Input from "../../common/Input";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import EmptyState from "../../common/EmptyState";
import { TableSkeleton } from "../../common/Skeleton";
import { UserIcon, RefreshIcon, CameraIcon, PlusIcon } from "../../common/Icons";
import {
  getOperators,
  getOperatorById,
  setOperatorEnabled,
  assignCameras,
  unassignCameras,
  createOperator,
} from "../../../services/operatorApi";
import { getAllCameras } from "../../../services/cameraApi";
import { formatDateTime } from "../../../utils/date";
import { useRealtime } from "../../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../../services/websocket";
import { useToast } from "../../common/Toast";

const PAGE_OPTIONS = [20, 50, 100];

/**
 * Operator management pane (Administrator only).
 * Lists SECURITY_OPERATOR users, shows presence + per-operator analytics,
 * and supports enable/disable plus camera assignment.
 */
function OperatorManagement({ readOnly = false }) {
  const [operators, setOperators] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [presence, setPresence] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({ fullName: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const push = useToast();

  // Assignment modal state
  const [assigning, setAssigning] = useState(null); // operator detail object
  const [selected, setSelected] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([getOperators({ page, limit, search, onlineStatus: presence, status: accountStatus, cameraId: cameraFilter }), getAllCameras()])
      .then(([opsRes, camRes]) => {
        setOperators(opsRes.data.items || []);
        setPagination(opsRes.data.pagination || {});
        setCameras(camRes.data || []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, limit, search, presence, accountStatus, cameraFilter]);

  useEffect(load, [load]);

  const { subscribe } = useRealtime();
  useEffect(() => subscribe(SOCKET_EVENTS.PROFILE_UPDATED, () => load()), [subscribe, load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createOperator(createDraft);
      setCreateDraft({ fullName: "", email: "", password: "" });
      setCreateOpen(false);
      push("Operator account created.", "success");
      load();
    } catch (err) {
      push(err?.message || "Failed to create operator.", "error");
    } finally {
      setCreating(false);
    }
  };

  const openAssign = async (op) => {
    setDetailLoading(true);
    setAssigning({ ...op, assignedCameras: op.assignedCameras || [] });
    try {
      const res = await getOperatorById(op.id);
      if (res.data) {
        setAssigning(res.data);
        setSelected((res.data.assignedCameras || []).map((c) => c.id).filter(Boolean));
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const saveAssignment = async () => {
    if (!assigning) return;
    setBusyId(assigning.id);
    try {
      const current = (assigning.assignedCameras || []).map((c) => c.id).filter(Boolean);
      const toAdd = selected.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !selected.includes(id));
      if (toAdd.length) await assignCameras(assigning.id, toAdd);
      if (toRemove.length) await unassignCameras(assigning.id, toRemove);
      setAssigning(null);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (op) => {
    setBusyId(op.id);
    try {
      await setOperatorEnabled(op.id, !(op.status === "ACTIVE"));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const onlineBadge = (op) => {
    if (op.onlineStatus === "ONLINE") return <Badge tone="success">Online</Badge>;
    if (op.onlineStatus === "IDLE") return <Badge tone="warning">Idle</Badge>;
    return <Badge tone="muted">Offline</Badge>;
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Operators</h3>
          <p className="text-sm text-slate-500">
            Security operator accounts, presence, and camera assignments.
          </p>
        </div>
        <div className="flex gap-2">
          {!readOnly && <Button size="sm" onClick={() => setCreateOpen(true)}><PlusIcon size={15} /> Add Operator</Button>}
          <Button variant="secondary" size="sm" onClick={load}><RefreshIcon size={15} /> Refresh</Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input id="operator-search" label="Search" placeholder="Name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <div><label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="operator-presence">Presence</label><select id="operator-presence" className="input-field" value={presence} onChange={(e) => { setPresence(e.target.value); setPage(1); }}><option value="">All</option><option value="ONLINE">Online</option><option value="IDLE">Idle</option><option value="OFFLINE">Offline</option></select></div>
        <div><label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="operator-status">Account Status</label><select id="operator-status" className="input-field" value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Disabled</option></select></div>
        <div><label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="operator-camera">Assigned Camera</label><select id="operator-camera" className="input-field" value={cameraFilter} onChange={(e) => { setCameraFilter(e.target.value); setPage(1); }}><option value="">All Cameras</option>{cameras.map((camera) => <option key={camera.cameraCode} value={camera.cameraCode}>{camera.cameraCode}</option>)}</select></div>
      </div>

      <div className="mt-4">
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : error ? (
          <EmptyState
            tone="error"
            icon={<UserIcon size={22} />}
            title="Unable to load operators."
            description="There was a problem fetching operator data."
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshIcon size={15} /> Retry
              </Button>
            }
          />
        ) : operators.length === 0 ? (
          <EmptyState icon={<UserIcon size={22} />} title="No operators" description="No security operator accounts exist yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-semibold">Operator</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Presence</th>
                  <th className="px-3 py-2 font-semibold">Last Active</th>
                  <th className="px-3 py-2 font-semibold">Cameras</th>
                  <th className="px-3 py-2 font-semibold">Workload</th>
                  <th className="px-3 py-2 font-semibold">Response</th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((op) => (
                  <tr key={op.id} className="border-b border-slate-100">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{op.fullName || op.email}</p>
                      <p className="text-xs text-slate-400">{op.email}</p>
                      <p className="text-xs text-slate-400">{op.publicId || `DB-${op.id}`} · {(op.role || "SECURITY_OPERATOR").replace(/_/g, " ")}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {op.status === "ACTIVE" ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="danger">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{onlineBadge(op)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{op.lastSeenAt ? formatDateTime(op.lastSeenAt) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <CameraIcon size={15} /> {op.assignedCameraCount ?? (op.assignedCameras || []).length}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      <p>Received {op.analytics?.alertsReceived ?? 0} · Pending {op.analytics?.pendingAlerts ?? 0}</p>
                      <p>Ack {op.analytics?.alertsAcknowledged ?? 0} · Resolved {op.analytics?.alertsResolved ?? 0}</p>
                      <p>MED {op.analytics?.mediumAcknowledged ?? 0} · HIGH {op.analytics?.highAcknowledged ?? 0} · CRIT esc {op.analytics?.criticalEscalated ?? 0}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{op.analytics?.avgAcknowledgeMinutes != null ? `${op.analytics.avgAcknowledgeMinutes}m avg ack` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {!readOnly && (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => openAssign(op)}>
                              Assign Cameras
                            </Button>
                            <Button
                              variant={op.status === "ACTIVE" ? "danger" : "success"}
                              size="sm"
                              loading={busyId === op.id}
                              onClick={() => toggleEnabled(op)}
                            >
                              {op.status === "ACTIVE" ? "Disable" : "Enable"}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <select className="input-field w-auto" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>{PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} per page</option>)}</select>
        <div className="flex items-center gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><span className="text-sm text-slate-500">Page {page} of {Math.max(1, pagination.totalPages || 0)}</span><Button variant="secondary" size="sm" disabled={page >= (pagination.totalPages || 0)} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
      </div>}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Operator">
        <div className="space-y-4">
          <Input id="new-operator-name" label="Full Name" value={createDraft.fullName} onChange={(e) => setCreateDraft((d) => ({ ...d, fullName: e.target.value }))} />
          <Input id="new-operator-email" type="email" label="Email" value={createDraft.email} onChange={(e) => setCreateDraft((d) => ({ ...d, email: e.target.value }))} />
          <Input id="new-operator-password" type="password" label="Temporary Password" hint="12–128 characters; stored only as a secure hash" value={createDraft.password} onChange={(e) => setCreateDraft((d) => ({ ...d, password: e.target.value }))} />
          <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button><Button size="sm" loading={creating} disabled={!createDraft.fullName.trim() || !createDraft.email.trim() || createDraft.password.length < 12} onClick={handleCreate}>Create Operator</Button></div>
        </div>
      </Modal>

      <Modal
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        title={`Assign Cameras — ${assigning?.fullName || assigning?.email || ""}`}
      >
        <ModalContent loading={detailLoading}>
          <p className="mb-3 text-sm text-slate-500">
            Select the cameras this operator is responsible for.
          </p>
          {cameras.length === 0 ? (
            <p className="text-sm text-slate-400">No cameras configured.</p>
          ) : (
            <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {cameras.map((c) => {
                const id = c.objectId ?? c.id;
                const checked = selected.includes(id);
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-blue-700"
                      checked={checked}
                      onChange={() =>
                        setSelected((prev) =>
                          checked ? prev.filter((x) => x !== id) : [...prev, id]
                        )
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-slate-700">{c.name || c.cameraCode}</span>
                      <span className="truncate text-xs text-slate-400">{c.cameraCode}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={busyId === assigning?.id} onClick={saveAssignment}>
              Save Assignments
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </Card>
  );
}

function ModalContent({ children, loading }) {
  if (loading) {
    return (
      <div className="p-2">
        <TableSkeleton rows={3} cols={2} />
      </div>
    );
  }
  return <div>{children}</div>;
}

export default OperatorManagement;
