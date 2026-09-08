import React, { useState } from "react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import Input from "../../common/Input";

const EMPTY = {
  id: "",
  name: "",
  location: "",
  sector: "North",
  rtspUrl: "",
  sourceType: "IP_CAMERA",
  streamProtocol: "RTSP",
  targetFps: "",
  enabled: true,
  description: "",
};

const SECTORS = ["North", "South", "East", "West", "Central"];
const SOURCE_TYPES = ["IP_CAMERA", "MOBILE", "VIDEO_FILE", "OTHER"];
const STREAM_PROTOCOLS = ["RTSP", "HTTP", "HLS", "WEBRTC", "OTHER"];

/**
 * Add / edit camera dialog. RTSP credentials are never echoed — the URL is
 * always masked so plugin secrets never reach the UI. Source type / protocol /
 * target FPS are persisted to the backend and consumed by the AI engine
 * (auto-reconnect on change).
 */
function CameraForm({ open, onClose, onSubmit, editing, canManage }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        id: editing.id,
        name: editing.name || "",
        location: editing.location || "",
        sector: editing.sector || "North",
        rtspUrl: "",
        sourceType: editing.sourceType || "IP_CAMERA",
        streamProtocol: editing.streamProtocol || "RTSP",
        targetFps: editing.targetFps != null ? String(editing.targetFps) : "",
        enabled: editing.enabled !== false,
        description: editing.description || "",
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const setEnabled = (e) => setForm((f) => ({ ...f, enabled: e.target.checked }));

  const submit = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.id.trim() && !editing) errs.id = "Camera ID is required";
    const fps = Number(form.targetFps);
    if (form.targetFps !== "" && !(fps > 0 && fps <= 60)) {
      errs.targetFps = "Target FPS must be between 0 and 60";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(form, editing);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.id}` : "Add Camera"}
      size="lg"
      footer={
        !canManage ? (
          <div className="text-sm text-slate-400">Read-only</div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>{editing ? "Save Changes" : "Add Camera"}</Button>
          </>
        )
      }
    >
      {!canManage && (
        <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Your role has read-only access to the Admin area. Editing is disabled.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Camera ID"
          id="cam-id"
          value={form.id}
          onChange={set("id")}
          error={errors.id}
          disabled={!!editing || !canManage}
          placeholder="e.g. CAM-11"
          hint={editing ? "ID cannot be changed" : "Unique identifier"}
        />
        <Input
          label="Name"
          id="cam-name"
          value={form.name}
          onChange={set("name")}
          error={errors.name}
          disabled={!canManage}
          placeholder="e.g. Checkpoint North"
        />
        <Input
          label="Location"
          id="cam-location"
          value={form.location}
          onChange={set("location")}
          disabled={!canManage}
          placeholder="e.g. Gate 3, Sector 12"
        />
        <div>
          <label htmlFor="cam-sector" className="mb-1.5 block text-sm font-medium text-slate-700">
            Sector
          </label>
          <select
            id="cam-sector"
            value={form.sector}
            onChange={set("sector")}
            disabled={!canManage}
            className="input-field"
          >
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="RTSP URL"
          id="cam-rtsp"
          value={form.rtspUrl}
          onChange={set("rtspUrl")}
          type="password"
          disabled={!canManage}
          placeholder="rtsp://••••••••••••"
          hint={editing
            ? "Leave blank to keep the existing URL; enter a new RTSP URL to replace it"
            : "Masked — never displayed after save"}
        />
        <div>
          <label htmlFor="cam-source-type" className="mb-1.5 block text-sm font-medium text-slate-700">
            Source Type
          </label>
          <select
            id="cam-source-type"
            value={form.sourceType}
            onChange={set("sourceType")}
            disabled={!canManage}
            className="input-field"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cam-protocol" className="mb-1.5 block text-sm font-medium text-slate-700">
            Stream Protocol
          </label>
          <select
            id="cam-protocol"
            value={form.streamProtocol}
            onChange={set("streamProtocol")}
            disabled={!canManage}
            className="input-field"
          >
            {STREAM_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Target Processing FPS"
          id="cam-target-fps"
          value={form.targetFps}
          onChange={set("targetFps")}
          error={errors.targetFps}
          disabled={!canManage}
          placeholder="e.g. 15"
          hint="Max frames/sec sent to AI (0.1–60). Blank uses the default (5). Changing this reconfigures the live AI pipeline automatically."
        />
        <label
          htmlFor="cam-enabled"
          className="flex cursor-pointer items-center gap-3 py-2 text-sm text-slate-700"
        >
          <input
            id="cam-enabled"
            type="checkbox"
            checked={form.enabled}
            onChange={setEnabled}
            disabled={!canManage}
            className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
          />
          Enabled
        </label>
        <Input
          label="Description"
          id="cam-desc"
          value={form.description}
          onChange={set("description")}
          disabled={!canManage}
          placeholder="Optional notes"
        />
      </div>
    </Modal>
  );
}

export default CameraForm;