import request from "./api";

// GET /api/operators  -> { items, pagination }
export function getOperators(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return request(`/api/operators${qs ? `?${qs}` : ""}`).then((res) => {
    const items = (res.data?.items || []).map(mapOperator);
    return { ...res, data: { items, pagination: res.data?.pagination || {} } };
  });
}

export async function getAllOperators(params = {}) {
  const pageSize = 100;
  const first = await getOperators({ ...params, page: 1, limit: pageSize });
  const totalPages = Number(first.data?.pagination?.totalPages || 0);
  if (totalPages <= 1) return first;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getOperators({ ...params, page: index + 2, limit: pageSize })
    )
  );
  return {
    ...first,
    data: {
      items: [first, ...remaining].flatMap((response) => response.data?.items || []),
      pagination: { ...first.data.pagination, page: 1, limit: pageSize },
    },
  };
}

export function createOperator(body) {
  return request("/api/operators", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, data: mapOperator(res.data?.operator) }));
}

// GET /api/operators/:operatorId
export function getOperatorById(id) {
  return request(`/api/operators/${id}`).then((res) => ({
    ...res,
    data: mapOperator(res.data?.operator) ,
  }));
}

// GET /api/operators/me/analytics  -> current operator self view
export function getMyOperatorAnalytics() {
  return request("/api/operators/me/analytics").then((res) => ({
    ...res,
    data: mapOperator(res.data?.operator),
  }));
}

// GET /api/analytics/operators  -> aggregate operator analytics (admin)
export function getOperatorsAnalytics() {
  return request("/api/analytics/operators").then((res) => ({
    ...res,
    data: {
      responseTime: mapResponseTime(res.data?.responseTime || {}),
      workload: (res.data?.workload || []).map(mapWorkload),
    },
  }));
}

// PATCH /api/operators/:operatorId/enabled
export function setOperatorEnabled(id, enabled) {
  return request(`/api/operators/${id}/enabled`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  }).then((res) => ({ ...res, data: mapOperator(res.data?.operator) }));
}

// POST / DELETE /api/operators/:operatorId/cameras
export function assignCameras(id, cameraIds) {
  return request(`/api/operators/${id}/cameras`, {
    method: "POST",
    body: JSON.stringify({ cameraIds }),
  }).then((res) => ({ ...res, data: mapOperator(res.data?.operator) }));
}

export function unassignCameras(id, cameraIds) {
  return request(`/api/operators/${id}/cameras`, {
    method: "DELETE",
    body: JSON.stringify({ cameraIds }),
  }).then((res) => ({ ...res, data: mapOperator(res.data?.operator) }));
}

function mapOperator(o) {
  if (!o) return null;
  return {
    id: o.id,
    publicId: o.publicId || null,
    fullName: o.fullName,
    email: o.email,
    role: o.role,
    status: o.status,
    onlineStatus: o.onlineStatus || "OFFLINE",
    connectedAt: o.connectedAt || null,
    lastSeenAt: o.lastSeenAt || null,
    createdAt: o.createdAt || null,
    assignedCameras: (o.assignedCameras || []).map((c) =>
      typeof c === "string" ? { cameraCode: c } : c
    ),
    assignedCameraCount: o.assignedCameraCount ?? (o.assignedCameras || []).length,
    analytics: o.analytics || {
      alertsReceived: Number(o.alertsReceived || 0),
      alertsAcknowledged: Number(o.alertsAcknowledged || 0),
      mediumAcknowledged: Number(o.mediumAcknowledged || 0),
      highAcknowledged: Number(o.highAcknowledged || 0),
      criticalEscalated: Number(o.criticalEscalated || 0),
      alertsResolved: Number(o.alertsResolved || 0),
      pendingAlerts: Number(o.pendingAlerts || 0),
      avgAcknowledgeMinutes: o.avgAcknowledgeMinutes ?? null,
      avgResolveMinutes: o.avgResolveMinutes ?? null,
    },
  };
}

function mapResponseTime(r) {
  return {
    acknowledgedTotal: Number(r.acknowledgedTotal || 0),
    avgAcknowledgeSeconds: r.avgAcknowledgeSeconds ?? null,
    avgResolveSeconds: r.avgResolveSeconds ?? null,
  };
}

function mapWorkload(w) {
  return {
    id: w.id,
    publicId: w.publicId,
    fullName: w.fullName,
    acknowledgedCount: Number(w.acknowledgedCount || 0),
    resolvedCount: Number(w.resolvedCount || 0),
    avgAcknowledgeSeconds: w.avgAcknowledgeSeconds ?? null,
  };
}
