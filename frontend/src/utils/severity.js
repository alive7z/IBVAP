// Central mapping from severity/status values to Badge tones.
// Keeps severity labeling consistent and text-visible (not color-only).

export const severityTone = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

export const statusTone = {
  new: "new",
  active: "active",
  acknowledged: "acknowledged",
  resolved: "resolved",
  open: "active",
  reviewed: "acknowledged",
  closed: "resolved",
};
