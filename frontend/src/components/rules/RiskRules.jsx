import React, { useCallback, useEffect, useState } from "react";
import {
  getRiskRules,
  updateRiskRule,
} from "../../../services/adminApi";
import Card from "../../common/Card";
import Button from "../../common/Button";
import Badge from "../../common/Badge";
import Loader from "../../common/Loader";
import { ArrowRightIcon, EditIcon, CctvIcon, BrainIcon, ActivityIcon, ShieldIcon, AlertTriangleIcon } from "../../common/Icons";
import { useToast } from "../../common/Toast";
import { useAdminAccess } from "../useAdminAccess";
import RuleForm from "./RuleForm";

const PIPELINE = [
  { label: "Detection", icon: CctvIcon, tone: "text-blue-600" },
  { label: "Context", icon: ActivityIcon, tone: "text-slate-600" },
  { label: "Behavior", icon: BrainIcon, tone: "text-slate-600" },
  { label: "Risk", icon: ShieldIcon, tone: "text-orange-600" },
  { label: "Action", icon: AlertTriangleIcon, tone: "text-red-600" },
];

function RiskRules() {
  const { canManage } = useAdminAccess();
  const toast = useToast();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: r } = await getRiskRules();
      setRules(r || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRuleSave = async (form) => {
    if (!editing) return;
    try {
      const { data } = await updateRiskRule(editing.id, form);
      setRules((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
      toast(`Rule ${editing.id} updated`, "success");
      setEditing(null);
    } catch (e) {
      toast(e.message || "Save failed", "error");
    }
  };

  const weightTone = (w) => (w >= 80 ? "critical" : w >= 60 ? "high" : w >= 40 ? "medium" : "low");

  return (
    <>
      {/* Pipeline visualization */}
      <Card className="mb-6">
        <p className="mb-3 text-sm font-semibold text-slate-800">
          How a single detection becomes an action
        </p>
        <p className="mb-4 text-xs text-slate-500">
          A single detection is not automatically critical — it must pass through context and
          behavior weighting before escalating.
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {PIPELINE.map((p, i) => {
            const Icon = p.icon;
            return (
              <React.Fragment key={p.label}>
                {i > 0 && <ArrowRightIcon size={16} className="mx-1 text-slate-300" />}
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Icon size={16} className={`${p.tone}`} />
                  <span className="text-sm font-medium text-slate-700">{p.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Rule list */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Risk Rules</p>
      </div>
      <Card pad={false} className="mb-6 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Rule</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Weight</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.rule}</p>
                      <p className="text-xs text-slate-400">{r.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{r.category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={weightTone(r.weight)}>{r.weight}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.runtimeSupported === false ? (
                        <span>
                          <Badge tone="offline">Unavailable</Badge>
                          <p className="mt-1 text-xs text-slate-400">
                            No AI-engine producer
                          </p>
                        </span>
                      ) : r.enabled ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : (
                        <Badge tone="offline">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                          <EditIcon size={14} /> Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RuleForm
        open={!!editing}
        onClose={() => setEditing(null)}
        onSubmit={handleRuleSave}
        rule={editing}
        canManage={canManage}
      />
    </>
  );
}

export default RiskRules;
