import request from "./api";

// GET /api/audit-logs with optional filters { action, entityType, userId, page, limit, sort }
export function getAuditLogs(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  return request(`/api/audit-logs${qs ? `?${qs}` : ""}`).then((res) => ({
    ...res,
    data: {
      items: (res.data?.items || []).map(mapAudit),
      pagination: res.data?.pagination || {},
    },
  }));
}

// GET /api/audit-logs/stats -> { total, maxRows }
export function getAuditLogStats() {
  return request("/api/audit-logs/stats").then((res) => ({
    ...res,
    data: {
      total: Number(res.data?.total || 0),
      maxRows: Number(res.data?.maxRows || 2000),
    },
  }));
}

// POST /api/audit-logs/cleanup -> { result: { beforeCount, afterCount, removedCount } }
export function cleanupAuditLogs() {
  return request("/api/audit-logs/cleanup", { method: "POST", body: JSON.stringify({}) }).then(
    (res) => ({ ...res, data: res.data?.result || {} })
  );
}

function mapAudit(a) {
  return {
    id: a.id,
    userId: a.user_id || a.userId || null,
    userName: a.user_name || null,
    userEmail: a.user_email || null,
    actorRole: a.actor_role || a.actorRole || null,
    action: a.action,
    entityType: a.entity_type || a.entityType || null,
    entityId: a.entity_id || a.entityId || null,
    details: a.details || null,
    ipAddress: a.ip_address || a.ipAddress || null,
    createdAt: a.created_at || null,
  };
}
