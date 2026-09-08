import React, { useCallback, useEffect, useState } from "react";
import { getSystemSettings, updateSystemSettings, getAuditLogs } from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Input from "../../common/Input";
import Badge from "../../common/Badge";
import Loader from "../../common/Loader";
import { CheckIcon, ClockIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import { SUPPORTED_LANGUAGES } from "../../../hooks/useLanguage";

function ToggleField({ label, value, disabled, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-700"
      />
    </label>
  );
}

function TextField({ label, value, disabled, onChange, options, masked }) {
  if (options) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
        <select className="input-field" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <Input
      label={label}
      value={value}
      disabled={disabled}
      type={masked ? "password" : "text"}
      onChange={(e) => onChange(e.target.value)}
      hint={masked ? "Masked — value never displayed" : undefined}
    />
  );
}

function SettingsCard({ title, subtitle, fields, values, setValue, onSave, canManage }) {
  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mb-4 text-xs text-slate-500">{subtitle}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) =>
          f.type === "toggle" ? (
            <ToggleField
              key={f.key}
              label={f.label}
              value={values[f.key]}
              disabled={!canManage}
              onChange={(v) => setValue(f.key, v)}
            />
          ) : (
            <TextField
              key={f.key}
              label={f.label}
              value={values[f.key]}
              disabled={!canManage}
              masked={f.masked}
              options={f.options}
              onChange={(v) => setValue(f.key, v)}
            />
          )
        )}
      </div>
      {canManage && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onSave}>
          <CheckIcon size={14} /> Save {title}
        </Button>
      )}
    </Card>
  );
}

function SystemSettings() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [settings, setSettings] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: a }] = await Promise.all([getSystemSettings(), getAuditLogs()]);
      setSettings(s);
      setAudit(a || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setValue = (group, key, val) =>
    setSettings((s) => ({ ...s, [group]: { ...s[group], [key]: val } }));

  const save = async (group, label) => {
    try {
      const { data } = await updateSystemSettings({ [group]: settings[group] });
      setSettings((s) => ({ ...s, [group]: data[group] }));
      toast(`${label} saved`, "success");
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="General"
        subtitle="Platform identity and display preferences."
        fields={[
          { key: "platformName", label: "Platform Name" },
          { key: "timezone", label: "Timezone", options: ["Asia/Kolkata", "UTC", "Asia/Kathmandu"] },
          { key: "language", label: "Language", options: SUPPORTED_LANGUAGES.map((l) => l.label) },
          { key: "dateFormat", label: "Date Format", options: ["DD MMM YYYY", "YYYY-MM-DD", "DD/MM/YYYY"] },
          { key: "timeFormat", label: "Time Format", options: ["24h", "12h"] },
        ]}
        values={settings.general}
        setValue={(k, v) => setValue("general", k, v)}
        onSave={() => save("general", "General settings")}
        canManage={canManage}
      />

      <SettingsCard
        title="Alert"
        subtitle="Alert dispatch and cooldown behavior."
        fields={[
          { key: "defaultCooldown", label: "Default Cooldown (s)" },
          { key: "autoAcknowledge", label: "Auto-acknowledge", type: "toggle" },
          { key: "criticalNotification", label: "Critical notification", type: "toggle" },
          { key: "evidenceCapture", label: "Evidence capture", type: "toggle" },
          { key: "incidentPre", label: "Incident pre-roll (s)" },
          { key: "incidentPost", label: "Incident post-roll (s)" },
        ]}
        values={settings.alert}
        setValue={(k, v) => setValue("alert", k, v)}
        onSave={() => save("alert", "Alert settings")}
        canManage={canManage}
      />

      <SettingsCard
        title="AI & Analytics"
        subtitle="Model confidence and tracking configuration."
        fields={[
          { key: "confidenceThreshold", label: "Confidence Threshold" },
          { key: "tracking", label: "Tracking Algorithm" },
          { key: "frameSampling", label: "Frame Sampling" },
          { key: "nightEnhancement", label: "Night Enhancement", type: "toggle" },
        ]}
        values={settings.ai}
        setValue={(k, v) => setValue("ai", k, v)}
        onSave={() => save("ai", "AI settings")}
        canManage={canManage}
      />

      <SettingsCard
        title="Evidence"
        subtitle="Automated evidence capture."
        fields={[
          { key: "snapshot", label: "Snapshot capture", type: "toggle" },
          { key: "incidentClip", label: "Incident clip", type: "toggle" },
          { key: "retentionDays", label: "Retention (days)" },
          { key: "storageWarning", label: "Storage Warning %" },
        ]}
        values={settings.evidence}
        setValue={(k, v) => setValue("evidence", k, v)}
        onSave={() => save("evidence", "Evidence settings")}
        canManage={canManage}
      />

      <SettingsCard
        title="Camera Health"
        subtitle="Reconnection and health polling."
        fields={[
          { key: "cameraReconnect", label: "Camera reconnect", type: "toggle" },
          { key: "reconnectInterval", label: "Reconnect Interval (s)" },
          { key: "healthInterval", label: "Health Poll (s)" },
          { key: "offlineWarning", label: "Offline warning", type: "toggle" },
        ]}
        values={settings.health}
        setValue={(k, v) => setValue("health", k, v)}
        onSave={() => save("health", "Health settings")}
        canManage={canManage}
      />

      <SettingsCard
        title="Integration"
        subtitle="External interoperability (masked credentials)."
        fields={[
          { key: "enabled", label: "Enable integration", type: "toggle" },
          { key: "endpoint", label: "Webhook Endpoint" },
          { key: "deliveryType", label: "Delivery Type", options: ["REST API", "Webhook", "Kafka"] },
          { key: "retry", label: "Retry on failure", type: "toggle" },
          { key: "apiKeyMasked", label: "API Key", masked: true },
        ]}
        values={settings.integration}
        setValue={(k, v) => setValue("integration", k, v)}
        onSave={() => save("integration", "Integration settings")}
        canManage={canManage}
      />

      <SettingsCard
        title="Security"
        subtitle="Session, authentication and auditing controls."
        fields={[
          { key: "sessionTimeout", label: "Session Timeout (min)" },
          { key: "maxLoginAttempts", label: "Max Login Attempts" },
          { key: "auditLogging", label: "Audit logging", type: "toggle" },
          { key: "passwordPolicy", label: "Password policy", type: "toggle" },
          { key: "rateLimiting", label: "Rate limiting", type: "toggle" },
        ]}
        values={settings.security}
        setValue={(k, v) => setValue("security", k, v)}
        onSave={() => save("security", "Security settings")}
        canManage={canManage}
      />

      {/* Audit log preview */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Audit Log</p>
            <p className="text-xs text-slate-500">Recent administration activity preview.</p>
          </div>
          <Badge tone="info">
            <ClockIcon size={12} /> {audit.length} entries
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Target</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="px-3 py-2.5 text-slate-500">{a.time}</td>
                  <td className="px-3 py-2.5 text-slate-700">{a.user}</td>
                  <td className="px-3 py-2.5 text-slate-700">{a.action}</td>
                  <td className="px-3 py-2.5 text-slate-500">{a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default SystemSettings;
