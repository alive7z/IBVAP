import React from "react";

const variants = {
  primary:
    "bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 active:bg-slate-100",
  danger:
    "bg-danger text-white hover:bg-red-700 active:bg-red-800",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100",
  success:
    "bg-success text-white hover:bg-green-700",
};

const sizes = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

/**
 * Shared button. "as" lets consumers render an anchor or router Link
 * while keeping the same visual/behavioral contract.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled = false,
  fullWidth = false,
  className = "",
  as: Tag = "button",
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <Tag
      type={type}
      disabled={isDisabled}
      className={`btn-focus inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      )}
      {children}
    </Tag>
  );
}

export default Button;
