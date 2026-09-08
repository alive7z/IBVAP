import React, { useEffect, useState } from "react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import Input from "../../common/Input";

const CATEGORIES = ["Detection", "Context", "Behavior", "Risk", "Action"];

/**
 * Edit an individual risk rule: label, weight/priority, and enabling.
 */
function RuleForm({ open, onClose, onSubmit, rule, canManage }) {
  const [form, setForm] = useState({
    rule: "",
    description: "",
    category: "Detection",
    weight: 50,
    enabled: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      rule
        ? {
            rule: rule.rule || "",
            description: rule.description || "",
            category: rule.category || "Detection",
            weight: rule.weight ?? 50,
            enabled: rule.enabled !== false,
          }
        : { rule: "", description: "", category: "Detection", weight: 50, enabled: true }
    );
  }, [open, rule]);

  // Rules without an AI-engine producer cannot produce runtime evidence; they
  // must stay disabled (the backend also rejects enabling them).
  const unsupported = rule && rule.runtimeSupported === false;

  const toggleEnabled = (e) => {
    if (unsupported) return;
    setForm((f) => ({ ...f, enabled: e.target.checked }));
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.rule.trim()) return;
    onSubmit({
      rule: form.rule,
      description: form.description,
      category: form.category,
      weight: Number(form.weight),
      enabled: form.enabled,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? `Edit rule ${rule.id}` : "Add Rule"}
      size="md"
      footer={
        !canManage ? (
          <div className="text-sm text-slate-400">Read-only</div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>Save</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <Input
          label="Rule Name"
          id="rule-name"
          value={form.rule}
          onChange={set("rule")}
          disabled={!canManage}
        />
        <Input
          label="Description"
          id="rule-desc"
          value={form.description}
          onChange={set("description")}
          disabled={!canManage}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rule-cat" className="mb-1.5 block text-sm font-medium text-slate-700">
              Category
            </label>
            <select id="rule-cat" value={form.category} onChange={set("category")} disabled={!canManage} className="input-field">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Weight / Priority"
            id="rule-weight"
            type="number"
            min="0"
            max="100"
            value={form.weight}
            onChange={set("weight")}
            disabled={!canManage}
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2.5">
          <span className="text-sm font-medium text-slate-700">Enabled</span>
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={!canManage || unsupported}
            onChange={toggleEnabled}
            className="h-4 w-4 rounded border-slate-300 text-blue-700"
          />
        </label>
        {unsupported && (
          <p className="text-xs text-amber-600">
            This rule has no runtime producer in the AI engine — it can never
            generate evidence, so it stays disabled.
          </p>
        )}
        {!canManage && <p className="text-xs text-slate-400">Read-only access.</p>}
      </div>
    </Modal>
  );
}

export default RuleForm;
