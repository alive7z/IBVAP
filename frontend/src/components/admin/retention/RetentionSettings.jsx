import React, { useCallback, useEffect, useState } from "react";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Input from "../../common/Input";
import Badge from "../../common/Badge";
import Modal from "../../common/Modal";
import EmptyState from "../../common/EmptyState";
import { TableSkeleton } from "../../common/Skeleton";
import { useToast } from "../../common/Toast";
import { ActivityIcon, RefreshIcon, TrashIcon } from "../../common/Icons";
import { getRetention, updateRetention, runRetention } from "../../../services/retentionApi";
import { cleanAllOperationalData } from "../../../services/retentionApi";
import { useRealtime } from "../../../context/RealtimeContext";

const DELETE_ALL_PHRASE = "DELETE ALL DATA";

const FIELDS = [
  { key: "maxNormalEvents", label: "Max Normal Events", hint: "Keep the most recent N normal (INFO/LOW) events", min: 0 },
  { key: "normalEventHours", label: "INFO / LOW (hours)", hint: "Age-based expiry for normal events", min: 0 },
  { key: "mediumEventHours", label: "MEDIUM (hours)", hint: "Age-based expiry for medium-severity events", min: 0 },
  { key: "highAlertHours", label: "HIGH (hours)", hint: "Age-based expiry for high-severity events", min: 0 },
  { key: "resolvedAlertHours", label: "Resolved Alerts (hours)", hint: "Retention window for resolved / false-positive alerts", min: 0 },
  { key: "criticalAlertHours", label: "CRITICAL (hours)", hint: "0 = keep critical-adjacent events indefinitely", min: 0 },
  { key: "evidenceHours", label: "Orphan Evidence (hours)", hint: "Age before orphaned evidence records are removed", min: 0 },
  { key: "cleanupIntervalMinutes", label: "Cleanup Interval (minutes)", hint: "How often the cleanup job runs", min: 1 },
];

/**
 * Retention & Storage pane (Administrator can edit + trigger; other roles
 * read-only). Serves the live retention_settings row and storage stats.
 */
function RetentionSettings({ readOnly }) {
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState({});
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [dangerPhrase, setDangerPhrase] = useState("");
  const [cleaningAll, setCleaningAll] = useState(false);
  const [error, setError] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const push = useToast();
  const { operationalDataEpoch, invalidateOperationalData } = useRealtime();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getRetention()
      .then((res) => {
        setSettings(res.data.settings);
        setStats(res.data.stats || {});
        setDraft({ ...res.data.settings });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, operationalDataEpoch]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateRetention(patchFromDraft(draft, saved || settings || {}));
      setSettings(res.data.settings);
      setSaved(res.data.settings);
      setStats((prev) => prev);
      push("Retention settings saved.", "success");
    } catch (err) {
      push(err?.message || "Failed to save retention settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setRunResult(null);
    setConfirmOpen(false);
    try {
      const res = await runRetention();
      setRunResult(res.data);
      push(
        res.data?.skipped ? "Retention cleanup skipped by policy." : "Retention cleanup completed.",
        res.data?.skipped ? "info" : "success"
      );
      load();
    } catch (err) {
      push(err?.message || "Retention cleanup failed.", "error");
    } finally {
      setRunning(false);
    }
  };

  const closeDanger = () => {
    if (cleaningAll) return;
    setDangerOpen(false);
    setDangerPhrase("");
  };

  const cleanAll = async () => {
    if (dangerPhrase !== DELETE_ALL_PHRASE) return;
    setCleaningAll(true);
    try {
      const res = await cleanAllOperationalData(dangerPhrase);
      setRunResult(res.data);
      setDangerOpen(false);
      setDangerPhrase("");
      push("All operational data was permanently deleted.", "success");
      invalidateOperationalData();
    } catch (err) {
      push(err?.message || "Failed to clean all operational data.", "error");
    } finally {
      setCleaningAll(false);
    }
  };

  if (loading) return <TableSkeleton rows={5} cols={3} />;
  if (error) {
    return (
      <EmptyState
        tone="error"
        icon={<ActivityIcon size={22} />}
        title="Unable to load retention settings."
        description="There was a problem fetching retention configuration."
        action={
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshIcon size={15} /> Retry
          </Button>
        }
      />
    );
  }
  if (!settings) return null;

  const hasChanges = draft && JSON.stringify(patchFromDraft(draft, settings || {})) !== "{}";
  const hours = settings;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Retention Policy</h3>
            <p className="text-sm text-slate-500">
              Automated cleanup protects critical evidence and prunes expired normal events.
              Protected events and alerts always survive cleanup.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={settings.autoCleanupEnabled ? "success" : "muted"}>
              {settings.autoCleanupEnabled ? "Auto-cleanup ON" : "Auto-cleanup OFF"}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              loading={running}
            >
              <TrashIcon size={15} /> Run Cleanup Now
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <Input
              key={f.key}
              id={`ret-${f.key}`}
              label={f.label}
              hint={f.hint}
              type="number"
              disabled={readOnly}
              value={draft?.[f.key] ?? hours[f.key]}
              min={f.min}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))
              }
            />
          ))}
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              className="accent-blue-700"
              disabled={readOnly}
              checked={draft?.autoCleanupEnabled ?? settings.autoCleanupEnabled}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, autoCleanupEnabled: e.target.checked }))
              }
            />
            Automatically run retention cleanup
          </label>
        </div>

        {!readOnly && hasChanges && (
          <div className="mt-4 flex justify-end">
            <Button variant="primary" size="md" loading={saving} onClick={save}>
              Save Settings
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">Storage Snapshot</h3>
        <p className="text-sm text-slate-500">Live data volume for the retention dashboard.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Total Events" value={stats.events} />
          <Stat label="Normal INFO/LOW" value={stats.normalEvents} />
          <Stat label="Protected Events" value={stats.protectedEvents} />
          <Stat label="Total Alerts" value={stats.alerts} />
          <Stat label="Protected Alerts" value={stats.protectedAlerts} />
          <Stat label="Evidence Records" value={stats.evidence} />
          <Stat label="Orphaned Evidence" value={stats.orphanedEvidence} />
          <Stat label="Evidence Storage" value={formatBytes(stats.evidenceStorageBytes)} formatted />
          <Stat label="Audit Logs / 2000" value={stats.auditLogs} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {stats.eventsBySeverity && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Events by severity</dt>
              {Object.entries(stats.eventsBySeverity).map(([s, n]) => (
                <dd key={s} className="flex justify-between text-sm text-slate-700">
                  <span>{s}</span>
                  <span className="font-semibold">{Number(n || 0).toLocaleString()}</span>
                </dd>
              ))}
            </div>
          )}
          {stats.alertsBySeverity && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Alerts by severity</dt>
              {Object.entries(stats.alertsBySeverity).map(([s, n]) => (
                <dd key={s} className="flex justify-between text-sm text-slate-700">
                  <span>{s}</span>
                  <span className="font-semibold">{Number(n || 0).toLocaleString()}</span>
                </dd>
              ))}
            </div>
          )}
          {stats.orphanedEvidence != null && (
            <div className="flex items-end text-sm text-slate-700">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700">
                {Number(stats.orphanedEvidence).toLocaleString()} orphaned evidence record(s)
              </span>
            </div>
          )}
          {stats.evidenceByType && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Evidence by type</dt>
              {Object.entries(stats.evidenceByType).map(([type, n]) => (
                <dd key={type} className="flex justify-between text-sm text-slate-700"><span>{type.replace(/_/g, " ")}</span><span className="font-semibold">{Number(n).toLocaleString()}</span></dd>
              ))}
            </div>
          )}
        </dl>

        {runResult && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-800">
              Last cleanup{runResult.skipped ? " skipped by policy" : " completed"} (
              {runResult.durationMs != null ? `${runResult.durationMs} ms` : ""}
              {runResult.mode ? ` · ${runResult.mode}` : ""})
            </p>
            <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
              <li>
                Events removed:{" "}
                <span className="font-semibold">
                  {Number(
                    runResult.eventsRemoved ??
                    runResult.deletedEvents ??
                    runResult.deletedRows?.events ??
                    0
                  ).toLocaleString()}
                </span>
              </li>
              <li>
                Alerts removed:{" "}
                <span className="font-semibold">
                  {Number(runResult.alertsRemoved ?? runResult.deletedRows?.alerts ?? 0).toLocaleString()}
                </span>
              </li>
              <li>
                Evidence removed:{" "}
                <span className="font-semibold">
                  {Number(runResult.evidenceRemoved ?? runResult.deletedRows?.evidence ?? 0).toLocaleString()}
                </span>
              </li>
              <li>
                Audit records removed:{" "}
                <span className="font-semibold">
                  {Number(runResult.auditLogsRemoved ?? 0).toLocaleString()}
                </span>
              </li>
              <li>
                Protected skipped:{" "}
                <span className="font-semibold">
                  {Number(runResult.protectedSkipped ?? 0).toLocaleString()}
                </span>
              </li>
            </ul>
          </div>
        )}
      </Card>

      {!readOnly && (
        <section className="rounded-xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900/70 dark:bg-red-950/20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-red-800 dark:text-red-300">Danger Zone</h3>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                Clean All Operational Data
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Permanently removes all events, alerts, intelligence observations, and evidence.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setDangerOpen(true)}>
              <TrashIcon size={15} /> Clean All Data
            </Button>
          </div>
        </section>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Run retention cleanup now">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            This runs the full cleanup immediately, even when auto-cleanup is off.
            Expired events and resolved alerts are purged; protected items, live
            alerts, and evidence still referenced by an event are preserved. The
            action is recorded in the audit log.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={running} onClick={runNow}>
              <TrashIcon size={14} /> Run Cleanup
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={dangerOpen} onClose={closeDanger} title="Clean All Operational Data?" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-semibold">This will permanently remove:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>all events and alerts, including protected records</li>
              <li>all evidence records, snapshots, clips, and face evidence</li>
              <li>all ANPR, vehicle, and face intelligence observations</li>
            </ul>
            <p className="mt-3">
              Camera configurations, users, zones, risk rules, retention settings, and audit logs will be preserved.
            </p>
            <p className="mt-3 font-bold">This action cannot be undone.</p>
          </div>

          <Input
            id="clean-all-confirmation"
            label={`Type ${DELETE_ALL_PHRASE} to continue`}
            value={dangerPhrase}
            disabled={cleaningAll}
            autoComplete="off"
            onChange={(event) => setDangerPhrase(event.target.value)}
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={cleaningAll} onClick={closeDanger}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={cleaningAll}
              disabled={dangerPhrase !== DELETE_ALL_PHRASE}
              onClick={cleanAll}
            >
              <TrashIcon size={14} /> Delete All Operational Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value, formatted = false }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-2xl font-bold text-slate-800">{value === null || value === undefined ? "—" : formatted ? value : Number(value).toLocaleString()}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function formatBytes(value) {
  if (value === null || value === undefined) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

// Build a minimal patch of only the fields a user actually changed.
function patchFromDraft(draft, base) {
  const patch = {};
  Object.entries(draft || {}).forEach(([k, v]) => {
    if (base[k] !== undefined && base[k] !== v) patch[k] = v;
  });
  return patch;
}

export default RetentionSettings;
