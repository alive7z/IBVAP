import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCameras,
  createCamera,
  updateCamera,
  deleteCamera,
} from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Loader from "../../common/Loader";
import Modal from "../../common/Modal";
import { SearchIcon, PlusIcon, EditIcon, TrashIcon, CctvIcon, AlertTriangleIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import CameraForm from "./CameraForm";

function streamTone(s) {
  if (s === "Online") return "online";
  if (s === "Offline") return "offline";
  return "default";
}

function CameraManagement() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getCameras();
      setCameras(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.id || "").toLowerCase().includes(q) ||
        (c.location || "").toLowerCase().includes(q)
    );
  }, [cameras, query]);

  const handleSave = async (form, editingCam) => {
    try {
      if (editingCam) {
        const { data } = await updateCamera(editingCam.id, {
          name: form.name,
          location: form.location,
          sector: form.sector,
          description: form.description,
          rtspUrl: form.rtspUrl,
          targetFps: form.targetFps,
          sourceType: form.sourceType,
          streamProtocol: form.streamProtocol,
          enabled: form.enabled,
        });
        setCameras((cs) => cs.map((c) => (c.id === editingCam.id ? data : c)));
        toast(`${editingCam.id} updated`, "success");
      } else {
        const { data } = await createCamera(form);
        setCameras((cs) => [data, ...cs]);
        toast(`${data.id} added`, "success");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCamera(deleteTarget.id);
      setCameras((cs) => cs.filter((c) => c.id !== deleteTarget.id));
      toast(`${deleteTarget.id} deleted`, "success");
      setDeleteTarget(null);
    } catch (e) {
      toast(e.message || "Delete failed", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Search cameras…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search cameras"
          />
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon size={16} /> Add Camera
          </Button>
        )}
      </div>

      <Card pad={false} className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-slate-500">Failed to load cameras. Please try again.</p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Camera</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                  <th className="px-4 py-3 font-semibold">AI</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No cameras match your search.
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-800">
                        <CctvIcon size={16} className="text-blue-600" />
                        {c.id}
                      </div>
                      <p className="text-xs text-slate-400">{c.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.location || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.sector || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={streamTone(c.streamStatus)}>{c.streamStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.aiStatus || "—"}</td>
                    <td className="px-4 py-3">
                      {c.enabled ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : (
                        <Badge tone="offline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(c);
                                setFormOpen(true);
                              }}
                            >
                              <EditIcon size={14} /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:text-rose-600"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <TrashIcon size={14} /> Delete
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
      </Card>
      <p className="mt-3 text-xs text-slate-400">
        {filtered.length} of {cameras.length} camera(s) shown. RTSP credentials are always masked.
      </p>

      <CameraForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSave}
        editing={editing}
        canManage={canManage}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete camera"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting…" : "Delete Camera"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangleIcon size={20} className="mt-0.5 shrink-0 text-rose-500" />
          <div>
            <p className="text-sm text-slate-700">
              Permanently remove <span className="font-semibold">{deleteTarget?.id}</span>?
            </p>
            <p className="mt-1 text-xs text-slate-400">
              This disables streaming and clears its runtime state. Events and
              alerts already recorded are kept.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default CameraManagement;
