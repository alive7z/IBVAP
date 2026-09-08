import React from "react";
import Card from "../common/Card";

/**
 * Human-readable risk reason breakdown for an alert.
 * Intended to later receive { risk_score, reasons[] } from the backend.
 */
function RiskReasons({ alert }) {
  const reasons = alert.reasons || [];
  const total = reasons.reduce((s, r) => s + (r.score || 0), 0);

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        Why This Alert Was Generated
      </h3>
      <ul className="space-y-2.5">
        {reasons.map((r, i) => (
          <li key={i}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{r.label}</span>
              <span className="font-medium text-slate-800">+{r.score}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{
                  width: `${Math.min(100, (r.score / Math.max(60, total)) * 100)}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-sm font-medium text-slate-600">
          Total Risk Score
        </span>
        <span className="text-lg font-bold text-slate-900">
          {alert.riskScore}
          <span className="text-sm font-medium text-slate-400"> /100</span>
        </span>
      </div>
    </Card>
  );
}

export default RiskReasons;
