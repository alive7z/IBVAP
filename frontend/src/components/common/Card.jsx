import React from "react";

/**
 * Consistent card wrapper.
 */
function Card({ children, className = "", pad = true, hover = false }) {
  return (
    <div className={`card ${hover ? "card-hover" : ""} ${pad ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Standardized card header: title (with optional leading icon) on the left,
 * optional action(s) on the right.
 */
export function CardHeader({ icon, title, subtitle, children, className = "" }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        {icon &&
          React.cloneElement(icon, {
            className: `${icon.props.className || ""} text-blue-700 dark:text-blue-500`.trim(),
          })}
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 text-[15px]">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export default Card;
