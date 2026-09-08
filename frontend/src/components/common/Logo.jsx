import React from "react";

// Shared platform logo. Renders the SVG favicon asset (single source of truth).
function Logo({ size = 24, className = "", rounded = true, ...props }) {
  return (
    <img
      src="/favicon.svg"
      alt="IBVAP"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        borderRadius: rounded ? "0.375rem" : undefined,
      }}
      {...props}
    />
  );
}

export default Logo;
