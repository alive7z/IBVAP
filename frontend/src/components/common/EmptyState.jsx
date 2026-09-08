import React from "react";

/**
 * Consistent empty / error state: neutral icon, title, optional description
 * and optional action. No large illustrations.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className = "",
}) {
  const iconTone =
    tone === "error"
      ? "text-red-500 bg-red-50 dark:bg-red-500/15"
      : tone === "warning"
      ? "text-orange-500 bg-orange-50 dark:bg-orange-500/15"
      : "text-slate-400 bg-slate-100 dark:bg-slate-100";
  return (
    <div
      className={`card flex flex-col items-center justify-center gap-3 p-10 text-center ${className}`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full ${iconTone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export default EmptyState;
