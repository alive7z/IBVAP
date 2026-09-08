// Role normalization helper.
// Backend issues UPPER_SNAKE roles (ADMINISTRATOR, SECURITY_OPERATOR,
// AUDITOR_ANALYST). The existing UI compares against display labels
// ("Administrator", "Security Operator", "Auditor / Analyst"). Map between
// them in ONE place so components keep working unchanged.

export const ROLE_KEY_LABEL = {
  ADMINISTRATOR: "Administrator",
  SECURITY_OPERATOR: "Security Operator",
  AUDITOR_ANALYST: "Auditor / Analyst",
};

export const ROLE_LABEL_KEY = {
  Administrator: "ADMINISTRATOR",
  "Security Operator": "SECURITY_OPERATOR",
  "Auditor / Analyst": "AUDITOR_ANALYST",
};

// Convert a backend role value to a display label. Falls back to the original
// value when unknown.
export function roleLabel(role) {
  return ROLE_KEY_LABEL[role] || role || "Security Operator";
}

// Convert a display label (or backend key) back to a backend role key.
export function roleKey(role) {
  return ROLE_LABEL_KEY[role] || role || "SECURITY_OPERATOR";
}

export const isAdmin = (role) =>
  roleKey(role) === "ADMINISTRATOR";

export const canAcknowledgeAlerts = (role) =>
  ["ADMINISTRATOR", "SECURITY_OPERATOR"].includes(roleKey(role));
