import { useMemo } from "react";

/**
 * Central chart colors for recharts. The app is light-mode only, so these
 * are static light-theme values.
 */
export function useChartTheme() {
  return useMemo(
    () => ({
      isDark: false,
      grid: "#e2e8f0",
      tick: "#64748b",
      axis: "#cbd5e1",
      divergent0: "#ffffff",
      divergent100: "#f8fafc",
      tooltipBg: "#ffffff",
      tooltipBorder: "#e2e8f0",
      tooltipText: "#1e293b",
      legendText: "#475569",
      barLabel: "#1e293b",
      surface: "#ffffff",
    }),
    []
  );
}
