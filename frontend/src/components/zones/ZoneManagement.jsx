import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getZones,
  createZone,
  updateZone,
  getCameras as getAdminCameras,
} from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import Loader from "../../common/Loader";
import { PlusIcon, EditIcon, LayersIcon, MapPinIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import ZoneForm from "./ZoneForm";
import ZoneBoundaryEditor from "./ZoneBoundaryEditor";

const riskTone = { Low: "low", Medium: "medium", High: "high", Critical: "critical" };

function ZoneManagement() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [zones, setZones] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [zoneResponse, cameraResponse] = await Promise.all([
        getZones(),
        getAdminCameras(),
      ]);
      setZones(Array.isArray(zoneResponse.data) ? zoneResponse.data : []);
      setCameras(Array.isArray(cameraResponse.data) ? cameraResponse.data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: zones.length,
      restricted: zones.filter((z) => z.type === "Restricted Zone").length,
      fence: zones.filter((z) => z.type === "Virtual Fence").length,
    }),
    [zones]
  );

  const handleSave = async (form, editingZone) => {
    try {
      if (editingZone) {
        const { data } = await updateZone(editingZone.id, {
          name: form.name,
          type: form.type,
          riskLevel: form.riskLevel,
          coordinates: form.coordinates,
        });
        setZones((zs) => zs.map((z) => (z.id === editingZone.id ? data : z)));
        toast(`${editingZone.id} updated`, "success");
      } else {
        const { data } = await createZone(form);
        setZones((zs) => [...zs, data]);
        toast(`${data.id} added`, "success");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total Zones", value: counts.total },
          { label: "Restricted", value: counts.restricted },
          { label: "Virtual Fences", value: counts.fence },
        ].map((k) => (
          <Card key={k.label} className="!p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-500">Manage surveillance zones and virtual fences.</p>
          <span className="hidden rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 sm:inline">
            Engine picks up zone changes on its config refresh (~30s)
          </span>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon size={16} /> Add Zone
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
            <p className="text-sm text-slate-500">Failed to load zones. Please try again.</p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Zone</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Camera</th>
                  <th className="px-4 py-3 font-semibold">Risk</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      No zones defined.
                    </td>
                  </tr>
                )}
                {zones.map((z) => (
                  <tr key={z.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-800">
                        <MapPinIcon size={16} className="text-blue-600" />
                        {z.id}
                      </div>
                      <p className="text-xs text-slate-400">{z.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{z.type}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-medium">{z.cameraId || "—"}</p>
                      <p className="text-xs text-slate-400">
                        {cameras.find((camera) => camera.id === z.cameraId)?.sector || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={riskTone[z.riskLevel] || "default"}>{z.riskLevel}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {z.enabled ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="offline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setPreview(z)}>
                          <LayersIcon size={14} /> Preview
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(z);
                                setFormOpen(true);
                              }}
                            >
                              <EditIcon size={14} /> Edit
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

      <ZoneForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSave}
        editing={editing}
        canManage={canManage}
        cameras={cameras}
        zones={zones}
      />

      {/* Preview */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Preview — ${preview.id}` : ""}
        size="xl"
        footer={
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Close
          </Button>
        }
      >
        {preview && (
          <div className="space-y-4">
            {cameras.find((camera) => camera.id === preview.cameraId) ? (
              <ZoneBoundaryEditor
                camera={cameras.find((camera) => camera.id === preview.cameraId)}
                zone={preview}
                zones={zones}
                coordinates={preview.coordinates}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
                Camera information is unavailable for this zone.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Type</p>
                <p className="font-medium text-slate-700">{preview.type}</p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Risk Level</p>
                <Badge tone={riskTone[preview.riskLevel] || "default"}>{preview.riskLevel}</Badge>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Camera</p>
                <p className="font-medium text-slate-700">{preview.cameraId || "—"}</p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">Coordinates</p>
                <p className="font-medium text-slate-700">{preview.coordinates?.length || 0} points</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default ZoneManagement;
