const ACKNOWLEDGEABLE_STATUSES = new Set(["new", "active"]);

export function normalizeAlertStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "open" || status === "unacknowledged") return "active";
  return status;
}

export function canAcknowledgeAlert(user, alert) {
  if (!user || !alert?.id) return false;
  if (!ACKNOWLEDGEABLE_STATUSES.has(normalizeAlertStatus(alert.status))) return false;

  const role = String(user.roleKey || user.role || "").trim().toUpperCase();
  const severity = String(alert.severity || "").trim().toUpperCase();
  if (role === "ADMINISTRATOR") {
    return ["MEDIUM", "HIGH", "CRITICAL"].includes(severity);
  }
  if (role === "SECURITY_OPERATOR" || role === "SECURITY OPERATOR") {
    return ["MEDIUM", "HIGH"].includes(severity);
  }
  return false;
}
