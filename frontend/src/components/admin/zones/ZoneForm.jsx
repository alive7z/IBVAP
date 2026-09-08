import React, { useEffect, useState } from "react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import Input from "../../common/Input";
import ZoneBoundaryEditor from "./ZoneBoundaryEditor";
import { geometryIsValid, isFenceType } from "./zoneGeometry";

const TYPES = ["Restricted Zone", "Monitoring Zone", "Virtual Fence"];
const RISK = ["Low", "Medium", "High", "Critical"];

const EMPTY = {
  id: "",
  name: "",
  type: "Restricted Zone",
  riskLevel: "Medium",
  cameraId: "",
  coordinates: [],
  enabled: true,
};

/**
 * Add / edit surveillance zone dialog backed by the selected camera's current
 * preview and the zone's persisted normalized geometry.
 */
function ZoneForm({ open, onClose, onSubmit, editing, canManage, cameras = [], zones = [] }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            name: editing.name || "",
            type: editing.type || "Restricted Zone",
            riskLevel: editing.riskLevel || "Medium",
            cameraId: editing.cameraId || "",
            coordinates: Array.isArray(editing.coordinates) ? editing.coordinates : [],
            enabled: editing.enabled !== false,
          }
        : { ...EMPTY, cameraId: cameras[0]?.id || "" }
    );
    setErrors({});
  }, [open, editing, cameras]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.id.trim() && !editing) errs.id = "Zone ID is required";
    if (!form.cameraId) errs.cameraId = "Camera is required";
    if (!geometryIsValid(form.type, form.coordinates)) {
      errs.coordinates = isFenceType(form.type)
        ? "Place both virtual-fence endpoints"
        : "A polygon requires at least 3 points";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(form, editing);
  };

  const selectedCamera = cameras.find((camera) => camera.id === form.cameraId) || null;

  const changeType = (event) => {
    const type = event.target.value;
    setForm((current) => ({
      ...current,
      type,
      coordinates: isFenceType(type)
        ? current.coordinates.slice(0, 2)
        : current.coordinates,
    }));
    setErrors((current) => ({ ...current, coordinates: null }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.id}` : "Add Zone"}
      size="xl"
      footer={
        !canManage ? (
          <div className="text-sm text-slate-400">Read-only</div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>{editing ? "Save Changes" : "Add Zone"}</Button>
          </>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Zone ID"
          id="zone-id"
          value={form.id}
          onChange={set("id")}
          error={errors.id}
          disabled={!!editing || !canManage}
          placeholder="e.g. ZONE-05"
          hint={editing ? "ID cannot be changed" : "Unique identifier"}
        />
        <Input
          label="Name"
          id="zone-name"
          value={form.name}
          onChange={set("name")}
          error={errors.name}
          disabled={!canManage}
          placeholder="e.g. Naka Checkpoint Area"
        />
        <div>
          <label htmlFor="zone-type" className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
          <select id="zone-type" value={form.type} onChange={changeType} disabled={!canManage} className="input-field">
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="zone-camera" className="mb-1.5 block text-sm font-medium text-slate-700">Camera</label>
          <select
            id="zone-camera"
            value={form.cameraId}
            onChange={set("cameraId")}
            disabled={!!editing || !canManage}
            className={`input-field ${errors.cameraId ? "border-danger" : ""}`}
          >
            <option value="">Select camera</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>{camera.id} · {camera.name}</option>
            ))}
          </select>
          {errors.cameraId && <p className="mt-1 text-xs text-danger">{errors.cameraId}</p>}
          {editing && <p className="mt-1 text-xs text-slate-400">Camera assignment cannot be changed</p>}
        </div>
        <div>
          <label htmlFor="zone-risk" className="mb-1.5 block text-sm font-medium text-slate-700">Risk Level</label>
          <select id="zone-risk" value={form.riskLevel} onChange={set("riskLevel")} disabled={!canManage} className="input-field">
            {RISK.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5">
        {selectedCamera ? (
          <ZoneBoundaryEditor
            camera={selectedCamera}
            zone={form}
            zones={zones}
            coordinates={form.coordinates}
            onChange={(coordinates) => {
              setForm((current) => ({ ...current, coordinates }));
              setErrors((current) => ({ ...current, coordinates: null }));
            }}
            canEdit={canManage}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
            Select a camera to edit its boundary.
          </div>
        )}
        {errors.coordinates && (
          <p className="mt-1 text-xs text-danger">{errors.coordinates}</p>
        )}
      </div>
    </Modal>
  );
}

export default ZoneForm;
