import React from "react";

// UI demonstration ranges only. Actual thresholds will come from backend
// configuration later.
export function riskCategory(score) {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 41) return "medium";
  if (score >= 21) return "low";
  return "info";
}

const barColor = {
  critical: "#b91c1c",
  high: "#dc2626",
  medium: "#ea580c",
  low: "#eab308",
  info: "#94a3b8",
};

/**
 * Risk score number plus a small progress bar.
 */
function RiskScoreBar({ score }) {
  const hasScore = score != null && !Number.isNaN(Number(score));
  if (!hasScore) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  const cat = riskCategory(score);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-800">{score}</span>
      <span className="text-xs text-slate-400">/100</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: barColor[cat] }}
          role="img"
          aria-label={`Risk score ${score} out of 100 (${cat})`}
        />
      </div>
    </div>
  );
}

export default RiskScoreBar;
